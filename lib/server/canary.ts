import 'server-only';
import { unstable_cache } from 'next/cache';
import { CANARY_ADDRESS } from '@/lib/constants';
import { readTeamWallet } from '@/lib/token';
import { computeCanaryState, makeTxSource } from '@/lib/canary/compute';
import { createRpc } from '@/lib/canary/rpc';
import type { CanaryState, Observation, TxRecord } from '@/lib/canary/types';
import { globalConfigStore } from './global-config';

// Per-instance memory. Survives between refreshes on a warm instance, lost on a cold start.
// The durable copies are the Global Config keys (death_tx, alive_since, balance_checkpoint).
const memory: { last?: Observation } = {};
const memo = new Map<string, TxRecord>();

async function compute(): Promise<CanaryState> {
  const rpc = createRpc();
  const txs = makeTxSource(rpc, CANARY_ADDRESS, {
    memo,
    // Finalized transactions never change, so their parse is cached with no expiry.
    persist: (fn) => unstable_cache(fn, ['canary-tx-v2', CANARY_ADDRESS], { revalidate: false }),
  });
  const state = await computeCanaryState({ address: CANARY_ADDRESS, feesCreator: readTeamWallet() ?? undefined, rpc, txs, store: globalConfigStore, memory });
  console.info(`[canary] ${state.status}, ${rpc.calls} RPC calls`);
  return state;
}

/** Shared by the page and /api/canary: at most one RPC refresh per 30 s. */
export const getCanaryState = unstable_cache(compute, ['canary-state-v5', CANARY_ADDRESS], {
  revalidate: 30,
  tags: ['canary'],
});

// The OG image is cached for 5 minutes. A 30 s entry inside it would pull the image's
// revalidate down to 30 s, so it has its own entry.
const getCanaryStateForOg = unstable_cache(compute, ['canary-state-og-v5', CANARY_ADDRESS], {
  revalidate: 300,
  tags: ['canary'],
});

export async function getCanaryStateSafe(opts: { og?: boolean } = {}): Promise<CanaryState | null> {
  try {
    return await (opts.og ? getCanaryStateForOg() : getCanaryState());
  } catch (e) {
    console.error(`[canary] ${(e as Error).message}`);
    return null;
  }
}
