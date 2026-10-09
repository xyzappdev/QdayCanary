// Live mainnet check of the /api/canary pipeline with the address swapped for ordinary wallets.
// Ordinary wallets sign and spend, so they should come out "dead" with a real deathTx.
// Run: npm run test:rpc   (uses SOLANA_RPC_URL or the public endpoint)
import { describe, expect, it } from 'vitest';
import { computeCanaryState, makeTxSource, type Store } from '@/lib/canary/compute';
import { createRpc } from '@/lib/canary/rpc';
import { isDeath } from '@/lib/canary/classify';
import type { CanaryState, Stored, TxRecord } from '@/lib/canary/types';
import { fetchFeesWaitingSol } from '@/lib/canary/fees';
import { creatorFeeAccounts } from '@/lib/solana/pda';

const SHORT_HISTORY = process.env.RPC_TEST_SHORT || 'E16prLnWTwfLUYgXRTELYgw4u8QUnN9CAcHceLrDTjN1';
const LONG_HISTORY = process.env.RPC_TEST_LONG || 'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg';

function memStore(): Store & { writes: string[] } {
  const s: Stored = { deathTx: null, aliveSince: null, checkpoint: null };
  const writes: string[] = [];
  return {
    writes,
    async read() { return { ...s }; },
    async create(k) { writes.push(k); return 'ok'; },
    async upsert(k) { writes.push(k); return 'ok'; },
  };
}

/** Runs up to `refreshes` refreshes the way production does: parsed transactions stay cached between them. */
async function check(address: string, refreshes = 1) {
  const store = memStore();
  const memo = new Map<string, TxRecord>();
  const memory = {};
  let state!: CanaryState;
  for (let i = 0; i < refreshes; i++) {
    const rpc = createRpc();
    state = await computeCanaryState({ address, rpc, txs: makeTxSource(rpc, address, { memo }), store, memory });
    console.log(`refresh ${i + 1}: ${state.status}, ${rpc.calls} RPC calls, ${memo.size} parsed, writes: ${store.writes}`);
    if (state.aliveSince || state.historyTruncated) break;
  }
  console.log(address, JSON.stringify({ ...state, feeds: state.feeds.slice(0, 3) }, null, 2));

  const bal = await createRpc().getBalance(address);
  expect(state.address).toBe(address);
  expect(state.balanceSol).not.toBeNull();
  // Balance may move between the two reads on a busy wallet; it must be close and non-negative.
  expect(state.balanceSol!).toBeGreaterThanOrEqual(0);
  expect(Math.abs(state.balanceSol! - bal.lamports / 1e9)).toBeLessThan(1);
  for (const f of state.feeds) {
    expect(f.amountSol).toBeGreaterThan(0);
    expect(f.signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/);
  }
  if (state.status === 'dead') {
    const tx = await createRpc().getTransaction(state.deathTx!);
    const { parseTx } = await import('@/lib/canary/classify');
    expect(isDeath(parseTx(state.deathTx!, tx!, address)!)).toBe(true);
    expect(store.writes).toContain('death_tx');
  }
  return state;
}

describe('live mainnet', () => {
  it('short history: every transaction parsed (over a few refreshes on the public RPC), not truncated', async () => {
    const s = await check(SHORT_HISTORY, 4);
    expect(s.historyTruncated).toBe(false);
    expect(s.status).not.toBe('unfunded');
    expect(s.aliveSince).not.toBeNull();
  });

  it('long history: truncated at the cap, still classified', async () => {
    const s = await check(LONG_HISTORY);
    expect(s.historyTruncated).toBe(true);
    expect(['alive', 'dead']).toContain(s.status);
  });

  it('the canary itself', async () => {
    const s = await check('AHiGL7feQqEko3yiDNCi7LJEviQKRbsT7joWn29zym9g');
    expect(['unfunded', 'alive']).toContain(s.status);
  });

  // The team wallet is not in the repository: it comes from TEAM_WALLET in .env / .env.local.
  const teamWallet = process.env.TEAM_WALLET?.trim();
  it.skipIf(!teamWallet)('fees waiting for the team wallet (needs TEAM_WALLET)', async () => {
    const rpc = createRpc();
    creatorFeeAccounts(teamWallet!);
    const fees = await fetchFeesWaitingSol(rpc, teamWallet!);
    console.log('feesWaitingSol', fees, `RPC calls: ${rpc.calls}`);
    expect(fees).toBeGreaterThanOrEqual(0);
  });
});
