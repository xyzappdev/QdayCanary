import type { RawTx } from './classify';
import type { Observation, SigInfo } from './types';

export const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

export class RpcError extends Error {
  constructor(message: string, readonly code?: number) { super(message); }
}

/** Just what the fee check reads from an account. `tokenAmount` is set for SPL token accounts. */
export type AccountLite = { lamports: number; space: number; tokenAmount: string | null };

export type Rpc = {
  getBalance(address: string, minContextSlot?: number): Promise<Observation>;
  getMultipleAccounts(addresses: string[]): Promise<(AccountLite | null)[]>;
  getMinimumBalanceForRentExemption(space: number): Promise<number>;
  getSignatures(address: string, opts: { limit: number; before?: string }): Promise<SigInfo[]>;
  getTransaction(signature: string): Promise<RawTx | null>;
  calls: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal JSON-RPC client. Every read uses commitment "finalized". */
export function createRpc(url = process.env.SOLANA_RPC_URL || DEFAULT_RPC): Rpc {
  let id = 0;
  const rpc: Rpc = {
    calls: 0,
    async getBalance(address, minContextSlot) {
      const cfg: Record<string, unknown> = { commitment: 'finalized' };
      if (minContextSlot) cfg.minContextSlot = minContextSlot;
      const r = await call<{ context: { slot: number }; value: number }>('getBalance', [address, cfg]);
      return { lamports: r.value, slot: r.context.slot };
    },
    async getMultipleAccounts(addresses) {
      type Raw = { lamports: number; space?: number; data: unknown } | null;
      const r = await call<{ value: Raw[] }>('getMultipleAccounts', [addresses, { commitment: 'finalized', encoding: 'jsonParsed' }]);
      return r.value.map((a) => {
        if (!a) return null;
        const parsed = (a.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } } | null)?.parsed;
        return { lamports: a.lamports, space: a.space ?? 0, tokenAmount: parsed?.info?.tokenAmount?.amount ?? null };
      });
    },
    getMinimumBalanceForRentExemption(space) {
      return call<number>('getMinimumBalanceForRentExemption', [space, { commitment: 'finalized' }]);
    },
    getSignatures(address, { limit, before }) {
      const cfg: Record<string, unknown> = { commitment: 'finalized', limit };
      if (before) cfg.before = before;
      return call<SigInfo[]>('getSignaturesForAddress', [address, cfg]);
    },
    getTransaction(signature) {
      return call<RawTx | null>('getTransaction', [
        signature,
        { commitment: 'finalized', encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
      ]);
    },
  };

  async function call<T>(method: string, params: unknown[]): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      rpc.calls++;
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
          cache: 'no-store',
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e) {
        if (attempt < 2) { await sleep(500 * 2 ** attempt); continue; }
        throw new RpcError(`${method}: ${(e as Error).message}`);
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        const after = Number(res.headers.get('retry-after'));
        await sleep(after > 0 ? Math.min(after, 5) * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new RpcError(`${method}: HTTP ${res.status}`, res.status);
      const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
      if (body.error) {
        // -32016: the node has not reached minContextSlot yet. Give it a moment.
        if (body.error.code === -32016 && attempt < 2) { await sleep(1500); continue; }
        throw new RpcError(`${method}: ${body.error.message}`, body.error.code);
      }
      return body.result as T;
    }
  }

  return rpc;
}

/** Runs `fn` over `items` with at most `limit` in flight. Keeps order. */
export async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
    }),
  );
  return out;
}
