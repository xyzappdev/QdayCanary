import { describe, expect, it } from 'vitest';
import { computeCanaryState, makeTxSource, type Store, type StoreValue } from '@/lib/canary/compute';
import type { RawTx } from '@/lib/canary/classify';
import type { Rpc } from '@/lib/canary/rpc';
import type { Observation, SigInfo, Stored } from '@/lib/canary/types';

const C = 'AHiGL7feQqEko3yiDNCi7LJEviQKRbsT7joWn29zym9g';
const S = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const X = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';

type Tx = { sig: string; slot: number; pre: number; post: number; time?: number };

/** A tiny chain: transactions touching the canary, oldest first. */
function chain(txs: Tx[], balances: Observation[]) {
  const raw = new Map<string, RawTx>();
  for (const t of txs) {
    const credit = t.post > t.pre;
    raw.set(t.sig, {
      slot: t.slot,
      blockTime: t.time ?? 1_760_000_000 + t.slot,
      meta: { err: null, preBalances: [credit ? 1e12 : t.pre, credit ? t.pre : 0], postBalances: [credit ? 1e12 - (t.post - t.pre) : t.post, credit ? t.post : t.pre - t.post] },
      transaction: {
        message: {
          accountKeys: credit ? [S, C] : [C, X],
          instructions: credit
            ? [{ program: 'system', parsed: { type: 'transfer', info: { source: S, destination: C, lamports: t.post - t.pre } } }]
            : [],
        },
      },
    } as RawTx);
  }
  let b = 0;
  const rpc: Rpc & { txCalls: number } = {
    calls: 0,
    txCalls: 0,
    async getBalance() { return balances[Math.min(b++, balances.length - 1)]; },
    async getSignatures(_a, { limit, before }) {
      const newest: SigInfo[] = [...txs].reverse().map((t) => ({ signature: t.sig, slot: t.slot, err: null, blockTime: null }));
      const start = before ? newest.findIndex((s) => s.signature === before) + 1 : 0;
      return newest.slice(start, start + limit);
    },
    async getTransaction(sig) { this.txCalls++; return raw.get(sig) ?? null; },
    async getMultipleAccounts(a) { return a.map(() => null); },
    async getMinimumBalanceForRentExemption() { return 890_880; },
  };
  return rpc;
}

function memStore(init: Partial<Stored> = {}) {
  const writes: { op: string; key: string; value: StoreValue }[] = [];
  const s: Stored = { deathTx: null, aliveSince: null, checkpoint: null, ...init };
  const store: Store = {
    async read() { return { ...s }; },
    async create(key, value) { writes.push({ op: 'create', key, value }); return 'ok'; },
    async upsert(key, value) { writes.push({ op: 'upsert', key, value }); return 'ok'; },
  };
  return { store, writes };
}

const run = (rpc: ReturnType<typeof chain>, store: Store, memory: { last?: Observation } = {}) =>
  computeCanaryState({
    address: C, rpc, store, memory,
    txs: makeTxSource(rpc, C),
    sleep: async () => {}, log: () => {}, now: () => Date.parse('2026-10-09T00:00:00Z'),
  });

describe('computeCanaryState', () => {
  it('unfunded: no history, zero balance, nothing written', async () => {
    const { store, writes } = memStore();
    const s = await run(chain([], [{ lamports: 0, slot: 10 }]), store);
    expect(s).toMatchObject({ status: 'unfunded', balanceSol: 0, feeds: [], deathTx: null, aliveSince: null, historyTruncated: false, balanceDropUnresolved: false });
    expect(writes).toEqual([]);
  });

  it('alive: feeds, birth written once with create, checkpoint stored', async () => {
    const { store, writes } = memStore();
    const s = await run(chain([{ sig: 'f1', slot: 100, pre: 0, post: 2e9 }, { sig: 'f2', slot: 200, pre: 2e9, post: 3e9 }], [{ lamports: 3e9, slot: 250 }]), store);
    expect(s.status).toBe('alive');
    expect(s.balanceSol).toBe(3);
    expect(s.feeds.map((f) => [f.signature, f.amountSol, f.from])).toEqual([['f2', 1, S], ['f1', 2, S]]);
    expect(s.aliveSince).toBe(new Date((1_760_000_000 + 100) * 1000).toISOString());
    expect(writes).toContainEqual({ op: 'create', key: 'alive_since', value: s.aliveSince });
    expect(writes.find((w) => w.key === 'balance_checkpoint')).toMatchObject({ op: 'upsert', value: { lamports: 3e9, slot: 250 } });
  });

  it('dead: a debit in the window is re-checked and recorded with create', async () => {
    const { store, writes } = memStore({ aliveSince: '2025-10-09T00:00:00.000Z' });
    const s = await run(chain([{ sig: 'f1', slot: 100, pre: 0, post: 2e9 }, { sig: 'd1', slot: 300, pre: 2e9, post: 0 }], [{ lamports: 0, slot: 350 }]), store);
    expect(s.status).toBe('dead');
    expect(s.deathTx).toBe('d1');
    expect(writes).toContainEqual({ op: 'create', key: 'death_tx', value: 'd1' });
  });

  it('fromTeam counts every team transfer read, not only the 10 feeds shown', async () => {
    const txs: Tx[] = [];
    for (let i = 0; i < 15; i++) txs.push({ sig: `t${i}`, slot: 100 + i, pre: i * 1e9, post: (i + 1) * 1e9 });
    const { store } = memStore();
    const rpc = chain(txs, [{ lamports: 15e9, slot: 200 }]);
    const s = await computeCanaryState({
      address: C, rpc, store, memory: {}, feesCreator: S,
      txs: makeTxSource(rpc, C), sleep: async () => {}, log: () => {},
    });
    expect(s.feeds).toHaveLength(10);
    expect(s.fromTeam).toEqual({ sol: 15, count: 15 });

    const other = await run(chain(txs, [{ lamports: 15e9, slot: 200 }]), memStore().store);
    expect(other.fromTeam).toBeNull(); // no team wallet configured
  });

  it('a recorded death_tx means dead, whatever RPC says', async () => {
    const { store } = memStore({ deathTx: 'recorded' });
    const s = await run(chain([{ sig: 'f1', slot: 100, pre: 0, post: 2e9 }], [{ lamports: 2e9, slot: 150 }]), store);
    expect(s).toMatchObject({ status: 'dead', deathTx: 'recorded', balanceSol: 2 });
  });

  it('spam pushed the death past the 1000 cap: a confirmed drop triggers a deep scan that finds it', async () => {
    const txs: Tx[] = [{ sig: 'f1', slot: 10, pre: 0, post: 50e9 }, { sig: 'death', slot: 20, pre: 50e9, post: 0 }];
    for (let i = 0; i < 2500; i++) txs.push({ sig: `dust${i}`, slot: 30 + i, pre: i * 1000, post: (i + 1) * 1000 });
    const rpc = chain(txs, [{ lamports: 2_500_000, slot: 3000 }]);
    const { store, writes } = memStore({ checkpoint: { lamports: 50e9, slot: 15, at: '2026-10-01T00:00:00Z' } });
    const s = await run(rpc, store);
    expect(s.historyTruncated).toBe(true);
    expect(s.status).toBe('dead');
    expect(s.deathTx).toBe('death');
    expect(s.balanceDropUnresolved).toBe(false);
    expect(writes).toContainEqual({ op: 'create', key: 'death_tx', value: 'death' });
    // 100 budgeted parses of the window, a few bisection steps, one re-check.
    expect(rpc.txCalls).toBeLessThan(100 + 20);
  });

  it('a drop on one read that the second read does not confirm is ignored', async () => {
    const { store } = memStore({ aliveSince: '2026-10-01T00:00:00.000Z' });
    const memory = { last: { lamports: 5e9, slot: 90 } };
    const rpc = chain([{ sig: 'f1', slot: 50, pre: 0, post: 5e9 }], [{ lamports: 1, slot: 100 }, { lamports: 5e9, slot: 101 }]);
    const s = await run(rpc, store, memory);
    expect(s.status).toBe('alive');
    expect(s.balanceDropUnresolved).toBe(false);
    expect(s.balanceSol).toBe(5);
  });

  it('an unexplained drop does not mark the canary dead and keeps the old baseline', async () => {
    const { store, writes } = memStore({ aliveSince: '2026-10-01T00:00:00.000Z' });
    const memory = { last: { lamports: 5e9, slot: 90 } };
    // Balance claims to be lower but no transaction after slot 90 lowered it.
    const rpc = chain([{ sig: 'f1', slot: 50, pre: 0, post: 5e9 }], [{ lamports: 1e9, slot: 100 }]);
    const s = await run(rpc, store, memory);
    expect(s.status).toBe('alive');
    expect(s.balanceDropUnresolved).toBe(true);
    expect(memory.last).toEqual({ lamports: 5e9, slot: 90 });
    expect(writes.some((w) => w.key === 'death_tx' || w.key === 'balance_checkpoint')).toBe(false);
  });

  it('balance fell on two reads and deepScan comes back empty: warning flag, status unchanged', async () => {
    // Checkpoint says 50 SOL at slot 500. Both reads say 10 SOL. The only transactions after slot 500
    // are incoming, so the deep scan finds no debit.
    const txs: Tx[] = [
      { sig: 'f1', slot: 100, pre: 0, post: 50e9 },
      { sig: 'f2', slot: 600, pre: 50e9, post: 51e9 },
    ];
    const rpc = chain(txs, [{ lamports: 10e9, slot: 700 }, { lamports: 10e9, slot: 701 }]);
    const { store, writes } = memStore({
      aliveSince: '2026-10-01T00:00:00.000Z',
      checkpoint: { lamports: 50e9, slot: 500, at: '2026-10-08T00:00:00Z' },
    });
    const memory: { last?: Observation } = {};
    const s = await run(rpc, store, memory);
    expect(s).toMatchObject({ status: 'alive', deathTx: null, balanceDropUnresolved: true, balanceSol: 10 });
    expect(writes).toEqual([]);
    expect(memory.last).toBeUndefined();

    // Next refresh: same picture, still a warning, still not dead.
    const again = await run(chain(txs, [{ lamports: 10e9, slot: 710 }, { lamports: 10e9, slot: 711 }]), store, memory);
    expect(again).toMatchObject({ status: 'alive', balanceDropUnresolved: true });
  });

  it('slow RPC: the refresh deadline runs out while bisecting, and the state comes back with the warning', async () => {
    // A drained canary buried under 2500 dust transfers. Every getTransaction takes 10 s of fake time,
    // every signature page 1 s. Bisecting 2500 signatures needs ~12 lookups = 120 s, more than is left.
    const txs: Tx[] = [{ sig: 'f1', slot: 10, pre: 0, post: 50e9 }, { sig: 'death', slot: 20, pre: 50e9, post: 0 }];
    for (let i = 0; i < 2500; i++) txs.push({ sig: `dust${i}`, slot: 30 + i, pre: i * 1000, post: (i + 1) * 1000 });
    const rpc = chain(txs, [{ lamports: 2_500_000, slot: 3000 }]);

    let t = 1_000_000;
    let phase: 'window' | 'scan' = 'window';
    let pagesInScan = 0, txInScan = 0;
    const getTransaction = rpc.getTransaction.bind(rpc);
    const getSignatures = rpc.getSignatures.bind(rpc);
    rpc.getTransaction = async (sig) => { t += 10_000; if (phase === 'scan') txInScan++; return getTransaction(sig); };
    rpc.getSignatures = async (a, o) => { t += 1_000; if (o.before) { phase = 'scan'; pagesInScan++; } return getSignatures(a, o); };
    const getBalance = rpc.getBalance.bind(rpc);
    rpc.getBalance = async (a, m) => { if (t > 1_000_000) phase = 'scan'; return getBalance(a, m); };

    const { store, writes } = memStore({ checkpoint: { lamports: 50e9, slot: 15, at: '2026-10-01T00:00:00Z' } });
    const memory: { last?: Observation; nextBirthSearch?: number } = {};
    const start = t;
    const s = await computeCanaryState({
      address: C, rpc, store, memory,
      txs: makeTxSource(rpc, C),
      now: () => t,
      sleep: async (ms) => { t += ms; },
      log: () => {},
    });

    expect(s).toMatchObject({ status: 'alive', deathTx: null, balanceDropUnresolved: true, historyTruncated: true });
    // The walk finished and the bisection started, then time ran out.
    expect(pagesInScan).toBeGreaterThanOrEqual(2);
    expect(txInScan).toBeGreaterThan(0);
    expect(txInScan).toBeLessThan(12);
    // Stopped at the deadline, give or take one in-flight call.
    expect(t - start).toBeLessThanOrEqual(100_000 + 10_000);
    // Baseline kept, nothing written, and the first-feed search was skipped rather than half-run.
    expect(memory.last).toBeUndefined();
    expect(memory.nextBirthSearch).toBeUndefined();
    expect(writes).toEqual([]);
  });

  it('a failed second read keeps the baseline but raises no warning', async () => {
    const { store } = memStore({ aliveSince: '2026-10-01T00:00:00.000Z' });
    const memory = { last: { lamports: 5e9, slot: 90 } };
    const rpc = chain([{ sig: 'f1', slot: 50, pre: 0, post: 5e9 }], [{ lamports: 1e9, slot: 100 }]);
    let reads = 0;
    const getBalance = rpc.getBalance.bind(rpc);
    rpc.getBalance = async (a, m) => { if (reads++ === 1) throw new Error('timeout'); return getBalance(a, m); };
    const s = await run(rpc, store, memory);
    expect(s).toMatchObject({ status: 'alive', balanceDropUnresolved: false });
    expect(memory.last).toEqual({ lamports: 5e9, slot: 90 });
  });
});
