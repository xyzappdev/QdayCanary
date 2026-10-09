import { bisectDebit, classify, FEEDS_SHOWN, isCredit, isDeath, LAMPORTS_PER_SOL, parseTx, teamTotal, toFeed } from './classify';
import { fetchFeesWaitingSol } from './fees';
import { pool, type Rpc } from './rpc';
import type { CanaryState, Observation, SigInfo, Stored, TxRecord } from './types';

/** Newest signatures looked at on every refresh. One getSignaturesForAddress page. */
export const HISTORY_CAP = 1000;
/** Transactions fetched from RPC per refresh. Cached ones are free. */
export const PARSE_BUDGET = 100;
/**
 * One deadline for the whole refresh. maxDuration is 120 s; the last 20 s are left for the
 * Global Config writes and the response. Every phase below gets min(its own limit, time left).
 */
export const REFRESH_MS = 100_000;
/** No new transaction fetches after this long. The public RPC serves roughly one a second. */
export const PARSE_TIME_MS = 20_000;
const PARSE_CONCURRENCY = 4;
/** Walking history past the cap and bisecting it, together. */
export const DEEP_SCAN_MS = 90_000;
const BIRTH_SEARCH_MS = 15_000;
/** Below this much time left, the first-feed search waits for the next refresh. */
const BIRTH_MIN_LEFT_MS = 10_000;
/** A birth search that could not finish is retried at most this often. */
const BIRTH_RETRY_MS = 3600_000;
/** Pause before the second balance read that confirms a drop. */
const CONFIRM_DELAY_MS = 2_000;
/** Global Config has few writes (250 a month on Hobby), so the balance checkpoint moves rarely. */
const CHECKPOINT_EVERY_MS = 12 * 3600_000;

export type StoreValue = string | number | boolean | null | { [k: string]: StoreValue };
export type WriteResult = 'ok' | 'exists' | 'off' | 'error';

export type Store = {
  read(): Promise<Stored>;
  /** Writes only if the key does not exist yet (Global Config "create"). */
  create(key: string, value: StoreValue): Promise<WriteResult>;
  upsert(key: string, value: StoreValue): Promise<WriteResult>;
};

export type TxSource = {
  /** Parsed transaction from memory, the persistent cache or RPC. Null if the count budget is spent. */
  record(sig: string, opts?: { force?: boolean }): Promise<TxRecord | null>;
  /** Straight from RPC with no cache, to re-check a death before it is recorded. */
  fresh(sig: string): Promise<TxRecord | null>;
};

export type Deps = {
  address: string;
  rpc: Rpc;
  txs: TxSource;
  store: Store;
  /** The team wallet: its unclaimed pump.fun fees are feesWaitingSol, its transfers in are fromTeam. */
  feesCreator?: string;
  /** Last balance seen by this instance, and when to look for the first feed again. */
  memory: { last?: Observation; nextBirthSearch?: number };
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
};

class BudgetSpent extends Error {}

/**
 * Builds a TxSource. `persist` wraps the RPC fetch in a cache that never expires
 * (finalized transactions do not change); `memo` keeps hot records in this instance.
 */
export function makeTxSource(
  rpc: Rpc,
  address: string,
  opts: {
    budget?: number;
    memo?: Map<string, TxRecord>;
    persist?: (fn: (sig: string) => Promise<TxRecord>) => (sig: string) => Promise<TxRecord>;
  } = {},
): TxSource {
  let left = opts.budget ?? PARSE_BUDGET;
  const memo = opts.memo ?? new Map<string, TxRecord>();

  const fromRpc = async (sig: string): Promise<TxRecord> => {
    if (left <= 0) throw new BudgetSpent();
    left--;
    const raw = await rpc.getTransaction(sig);
    if (!raw) throw new Error(`transaction ${sig} not found`);
    const rec = parseTx(sig, raw, address);
    if (!rec) throw new Error(`address not in ${sig}`);
    return rec;
  };
  const cached = opts.persist ? opts.persist(fromRpc) : fromRpc;

  return {
    async record(sig, o) {
      const hit = memo.get(sig);
      if (hit) return hit;
      // Forced reads (deep scan, one at a time) always get one unit of budget.
      if (o?.force) left = Math.max(left, 1);
      try {
        const rec = await cached(sig);
        memo.set(sig, rec);
        if (memo.size > 5000) memo.delete(memo.keys().next().value!);
        return rec;
      } catch {
        return null;
      }
    },
    async fresh(sig) {
      const raw = await rpc.getTransaction(sig);
      return raw ? parseTx(sig, raw, address) : null;
    },
  };
}

const iso = (unix: number) => new Date(unix * 1000).toISOString();

export async function computeCanaryState(d: Deps): Promise<CanaryState> {
  const now = d.now ?? Date.now;
  const sleep = d.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = d.log ?? ((m) => console.warn(`[canary] ${m}`));
  const addr = d.address;
  const deadline = now() + REFRESH_MS;
  /** End of a phase: its own limit or the refresh deadline, whichever comes first. */
  const until = (limitMs: number) => Math.min(now() + limitMs, deadline);

  const stored = await d.store.read().catch((e): Stored => {
    log(`config read failed: ${(e as Error).message}`);
    return { deathTx: null, aliveSince: null, checkpoint: null };
  });

  // Never accept a balance older than one we already saw: a lagging node would look like a drop.
  const minSlot = Math.max(d.memory.last?.slot ?? 0, stored.checkpoint?.slot ?? 0) || undefined;
  const [bal, sigs, feesWaitingSol] = await Promise.all([
    d.rpc.getBalance(addr, minSlot).catch((e) => { log(`getBalance: ${(e as Error).message}`); return null; }),
    d.rpc.getSignatures(addr, { limit: HISTORY_CAP }).catch((e) => { log(`getSignatures: ${(e as Error).message}`); return null; }),
    d.feesCreator
      ? fetchFeesWaitingSol(d.rpc, d.feesCreator).catch((e) => { log(`fees: ${(e as Error).message}`); return null; })
      : Promise.resolve(null),
  ]);

  if (!bal || !sigs) {
    // A recorded death does not need RPC.
    if (stored.deathTx) {
      return {
        address: addr, status: 'dead', balanceSol: bal ? bal.lamports / LAMPORTS_PER_SOL : null,
        aliveSince: stored.aliveSince, feeds: [], deathTx: stored.deathTx,
        historyTruncated: false, balanceDropUnresolved: false, feesWaitingSol, fromTeam: null, checkedAt: new Date(now()).toISOString(),
      };
    }
    throw new Error('Solana RPC unavailable');
  }

  const historyTruncated = sigs.length >= HISTORY_CAP;
  const parseEnd = until(PARSE_TIME_MS);
  const parsed = await pool(sigs, PARSE_CONCURRENCY, async (s) => (now() > parseEnd ? null : d.txs.record(s.signature)));
  const records = parsed.filter((r): r is TxRecord => r !== null);
  const allParsed = records.length === sigs.length;

  const c = classify({
    balanceLamports: bal.lamports,
    records,
    recordedDeath: stored.deathTx,
    recordedAliveSince: stored.aliveSince,
  });

  let deathTx = stored.deathTx;
  let candidate = deathTx ? null : (c.death?.signature ?? null);

  // Spam insurance: if the balance fell below a level seen before and the window above holds
  // no debit, look past the cap. A drop alone never marks the canary dead; only a transaction does.
  let dropConfirmed = false;
  let secondReadFailed = false;
  let cur: Observation = bal;
  if (!deathTx && !candidate) {
    const base = [d.memory.last, stored.checkpoint]
      .filter((b): b is Observation => !!b && bal.lamports < b.lamports)
      .sort((a, b) => b.slot - a.slot)[0];
    if (base) {
      await sleep(Math.max(0, Math.min(CONFIRM_DELAY_MS, deadline - now())));
      const again = now() < deadline ? await d.rpc.getBalance(addr, bal.slot).catch(() => null) : null;
      // The second read is the newer truth. If it failed, trust neither and keep the baseline.
      if (again) cur = again; else secondReadFailed = true;
      if (again && again.lamports < base.lamports) {
        log(`balance ${again.lamports} below ${base.lamports} seen at slot ${base.slot}, deep scan`);
        dropConfirmed = true;
        // Out of time counts as not found: warning on, baseline kept, status unchanged.
        candidate = await deepScan(d, base, again, until(DEEP_SCAN_MS), now);
      }
    }
  }

  if (candidate) {
    // Check once more, uncached, before the death is written down for good. Out of time: next refresh.
    const check = now() >= deadline
      ? undefined
      : await d.txs.fresh(candidate).catch((e) => { log(`re-check failed: ${(e as Error).message}`); return undefined; });
    if (check && isDeath(check)) {
      deathTx = candidate;
      const w = await d.store.create('death_tx', deathTx);
      if (w !== 'ok' && w !== 'off') log(`death_tx write: ${w}`);
    } else if (check !== undefined) {
      log(`candidate ${candidate} did not re-check as a death`);
      candidate = null;
    }
  }

  const status = deathTx || candidate ? 'dead' : c.status === 'dead' ? 'alive' : c.status;
  // Fell on two reads, but no transaction explains it yet: a warning, not a death.
  const balanceDropUnresolved = dropConfirmed && status !== 'dead';
  const keepBaseline = balanceDropUnresolved || secondReadFailed;

  // Birth: the first incoming transfer ever. Only recorded once the whole history was seen.
  let aliveSince = stored.aliveSince;
  if (!aliveSince && status !== 'unfunded') {
    let first: TxRecord | null = null;
    if (!historyTruncated) first = allParsed ? c.firstCredit : null;
    else if ((d.memory.nextBirthSearch ?? 0) <= now() && deadline - now() >= BIRTH_MIN_LEFT_MS) {
      first = await findFirstCredit(d, until(BIRTH_SEARCH_MS), now);
      if (!first) d.memory.nextBirthSearch = now() + BIRTH_RETRY_MS;
    }
    if (first?.blockTime) {
      aliveSince = iso(first.blockTime);
      const w = await d.store.create('alive_since', aliveSince);
      if (w !== 'ok' && w !== 'off') log(`alive_since write: ${w}`);
    }
  }

  // Durable baseline for the drop check. Moves only up, and at most twice a day.
  if (status === 'alive' && !keepBaseline && cur.lamports > 0) {
    const cp = stored.checkpoint;
    if (!cp || (cur.lamports > cp.lamports && now() - Date.parse(cp.at) >= CHECKPOINT_EVERY_MS)) {
      await d.store.upsert('balance_checkpoint', { lamports: cur.lamports, slot: cur.slot, at: new Date(now()).toISOString() });
    }
  }

  // Keep the higher baseline while a drop is unexplained, so the next refresh searches again.
  if (!keepBaseline) d.memory.last = { lamports: cur.lamports, slot: cur.slot };

  return {
    address: addr,
    status,
    balanceSol: cur.lamports / LAMPORTS_PER_SOL,
    aliveSince,
    feeds: c.credits.slice(0, FEEDS_SHOWN).map(toFeed),
    deathTx: deathTx ?? candidate,
    historyTruncated,
    balanceDropUnresolved,
    feesWaitingSol,
    fromTeam: d.feesCreator ? { ...teamTotal(c.credits, d.feesCreator), complete: allParsed } : null,
    checkedAt: new Date(now()).toISOString(),
  };
}

/** Signatures newer than `afterSlot` (and not newer than `uptoSlot`), oldest first. */
async function walk(d: Deps, deadline: number, now: () => number, afterSlot = -1, uptoSlot = Infinity): Promise<SigInfo[] | null> {
  const out: SigInfo[] = [];
  let before: string | undefined;
  for (;;) {
    if (now() > deadline) { d.log?.('history walk ran out of time'); return null; }
    const page = await d.rpc.getSignatures(d.address, { limit: HISTORY_CAP, before });
    for (const s of page) {
      if (s.slot <= afterSlot) return out.reverse();
      if (s.slot <= uptoSlot) out.push(s);
    }
    if (page.length < HISTORY_CAP) return out.reverse();
    before = page[page.length - 1].signature;
  }
}

/** Finds the debit between a remembered balance and a lower current one. Walk and bisection share `deadline`. */
async function deepScan(d: Deps, base: Observation, cur: Observation, deadline: number, now: () => number) {
  const between = await walk(d, deadline, now, base.slot, cur.slot).catch(() => null);
  if (!between?.length) return null;
  const sigs = between.map((s) => s.signature);
  const read = async (sig: string) => {
    if (now() > deadline) { d.log?.('deep scan ran out of time while bisecting'); return null; }
    return d.txs.record(sig, { force: true });
  };
  const i = await bisectDebit(sigs, base.lamports, cur.lamports, async (sig) => (await read(sig))?.post ?? null);
  if (i === null) return null;
  const rec = await read(sigs[i]);
  return rec && isDeath(rec) ? rec.signature : null;
}

/** Walks to the very first signature and returns the oldest incoming transfer. */
async function findFirstCredit(d: Deps, deadline: number, now: () => number): Promise<TxRecord | null> {
  const all = await walk(d, deadline, now).catch(() => null);
  if (!all) return null;
  for (const s of all) {
    if (now() > deadline) return null;
    const r = await d.txs.record(s.signature);
    if (!r) return null; // budget spent, try on the next refresh
    if (isCredit(r)) return r;
  }
  return null;
}
