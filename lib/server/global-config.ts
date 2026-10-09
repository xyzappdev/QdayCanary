import 'server-only';
import { createClient, parseConnectionString } from '@vercel/global-config';
import type { Store, StoreValue, WriteResult } from '@/lib/canary/compute';
import type { Checkpoint, Stored } from '@/lib/canary/types';

// Optional. Without a connected store the site still works; it just cannot keep death_tx,
// alive_since and balance_checkpoint between refreshes.
// Edge Config was renamed to Global Config. The SDK and the REST API accept both names,
// so the variables from either era work.
const connection = () => process.env.GLOBAL_CONFIG || process.env.EDGE_CONFIG || '';

function configId(): string | null {
  const explicit = process.env.EDGE_CONFIG_ID || process.env.GLOBAL_CONFIG_ID;
  if (explicit) return explicit;
  const c = connection();
  return c ? (parseConnectionString(c)?.id ?? null) : null;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function asCheckpoint(v: unknown): Checkpoint | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const lamports = Number(o.lamports), slot = Number(o.slot);
  if (!Number.isFinite(lamports) || !Number.isFinite(slot) || typeof o.at !== 'string') return null;
  return { lamports, slot, at: o.at };
}

/** Reads every key in one call (one billed read). */
export async function readStored(): Promise<Stored> {
  let items: Record<string, unknown> = {};
  const c = connection();
  if (c) items = await createClient(c).getAll();
  return {
    deathTx: str(items.death_tx),
    aliveSince: str(items.alive_since),
    checkpoint: asCheckpoint(items.balance_checkpoint),
  };
}

type Op = { operation: 'create' | 'upsert'; key: string; value: StoreValue };

/** PATCH items through the Vercel REST API. All operations succeed or none do. */
async function patchItems(items: Op[]): Promise<WriteResult> {
  const id = configId();
  const token = process.env.VERCEL_API_TOKEN;
  if (!id || !token) return 'off';
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
  try {
    const res = await fetch(`https://api.vercel.com/v1/global-config/${encodeURIComponent(id)}/items${team}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return 'ok';
    const body = await res.text().catch(() => '');
    // "create" on an existing key fails the whole request.
    if (items.some((i) => i.operation === 'create') && /exist/i.test(body)) return 'exists';
    console.error(`[global-config] PATCH ${res.status}: ${body.slice(0, 300)}`);
    return 'error';
  } catch (e) {
    console.error(`[global-config] PATCH failed: ${(e as Error).message}`);
    return 'error';
  }
}

export const globalConfigStore: Store = {
  read: () => readStored(),
  create: (key, value) => patchItems([{ operation: 'create', key, value }]),
  upsert: (key, value) => patchItems([{ operation: 'upsert', key, value }]),
};
