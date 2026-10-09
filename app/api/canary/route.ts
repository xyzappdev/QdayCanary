import { getCanaryStateSafe } from '@/lib/server/canary';

export const revalidate = 30;
export const maxDuration = 120;

export async function GET() {
  const state = await getCanaryStateSafe();
  if (!state) return Response.json({ error: 'Solana RPC unavailable' }, { status: 503 });
  return Response.json(state);
}
