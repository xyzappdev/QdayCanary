import type { Feed, Status, TxRecord } from './types';

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const FEEDS_SHOWN = 10;

type ParsedIx = {
  program?: string;
  parsed?: { type?: string; info?: Record<string, unknown> };
};
type AccountKey = string | { pubkey: string; signer?: boolean };

/** The subset of a jsonParsed getTransaction response that we read. */
export type RawTx = {
  slot: number;
  blockTime?: number | null;
  meta: {
    err: unknown;
    preBalances: number[];
    postBalances: number[];
    innerInstructions?: { instructions: ParsedIx[] }[] | null;
  } | null;
  transaction: { message: { accountKeys: AccountKey[]; instructions: ParsedIx[] } };
};

const keyOf = (k: AccountKey) => (typeof k === 'string' ? k : k.pubkey);

/** Reduces a transaction to what it did to `address`. Null if the address is not in it. */
export function parseTx(signature: string, tx: RawTx, address: string): TxRecord | null {
  if (!tx.meta) return null;
  const keys = tx.transaction.message.accountKeys.map(keyOf);
  const i = keys.indexOf(address);
  if (i < 0) return null;
  const k = tx.transaction.message.accountKeys[i];
  const signer = typeof k === 'object' && k.signer === true;
  const pre = tx.meta.preBalances[i];
  const post = tx.meta.postBalances[i];
  if (typeof pre !== 'number' || typeof post !== 'number') return null;

  let from: string | null = null;
  if (post > pre) {
    const ixs = [
      ...tx.transaction.message.instructions,
      ...(tx.meta.innerInstructions ?? []).flatMap((g) => g.instructions),
    ];
    for (const ix of ixs) {
      const info = ix.parsed?.info;
      if (ix.program !== 'system' || !info) continue;
      if (info.destination === address || info.newAccount === address) {
        from = typeof info.source === 'string' ? info.source : null;
        if (from) break;
      }
    }
    // Not a plain system transfer: credit whoever lost the most lamports.
    if (!from) {
      let best = 0;
      keys.forEach((k, j) => {
        const drop = (tx.meta!.preBalances[j] ?? 0) - (tx.meta!.postBalances[j] ?? 0);
        if (j !== i && drop > best) { best = drop; from = k; }
      });
    }
  }

  return {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    failed: tx.meta.err != null,
    signer,
    pre,
    post,
    from,
  };
}

export const isDebit = (r: TxRecord) => r.post < r.pre;
/** The canary is dead if it signed a finalized transaction or its balance went down. Either needs its key. */
export const isDeath = (r: TxRecord) => r.signer || isDebit(r);
export const isCredit = (r: TxRecord) => r.post > r.pre;

export type Classification = {
  status: Status;
  /** Oldest transaction in view that the canary signed or that lowered its balance. */
  death: TxRecord | null;
  /** Oldest incoming transfer in view. */
  firstCredit: TxRecord | null;
  /** Incoming transfers, newest first. */
  credits: TxRecord[];
};

/**
 * dead     — the canary signed some transaction, or one lowered its balance (or a death was already recorded);
 * unfunded — balance is 0 and nobody ever sent anything in (mentions do not count);
 * alive    — everything else.
 */
export function classify(input: {
  balanceLamports: number | null;
  records: TxRecord[];
  recordedDeath?: string | null;
  recordedAliveSince?: string | null;
}): Classification {
  const byAge = [...input.records].sort((a, b) => a.slot - b.slot);
  const death = byAge.find(isDeath) ?? null;
  const creditsOld = byAge.filter(isCredit);
  const credits = [...creditsOld].reverse();
  const firstCredit = creditsOld[0] ?? null;

  let status: Status;
  if (input.recordedDeath || death) status = 'dead';
  else if ((input.balanceLamports ?? 0) === 0 && !firstCredit && !input.recordedAliveSince) status = 'unfunded';
  else status = 'alive';

  return { status, death, firstCredit, credits };
}

export const toFeed = (r: TxRecord): Feed => ({
  from: r.from,
  amountSol: (r.post - r.pre) / LAMPORTS_PER_SOL,
  time: r.blockTime ? new Date(r.blockTime * 1000).toISOString() : null,
  signature: r.signature,
});

/**
 * Finds a debit between two balance readings without parsing every transaction.
 * `txs` are the transactions between the readings, oldest first. The balance before them was
 * `before`, after them `after`, and `after < before`. Bisection keeps an interval whose left
 * balance is above its right balance, so it ends on one transaction whose post < pre.
 */
export async function bisectDebit(
  txs: string[],
  before: number,
  after: number,
  postOf: (sig: string) => Promise<number | null>,
): Promise<number | null> {
  if (!(after < before) || txs.length === 0) return null;
  let lo = -1, hi = txs.length, loVal = before, hiVal = after;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    const v = await postOf(txs[m]);
    if (v === null) return null;
    if (v > hiVal) { lo = m; loVal = v; } else { hi = m; hiVal = v; }
  }
  return hi < txs.length && loVal > hiVal ? hi : null;
}
