import { CanaryPage } from '@/components/CanaryPage';
import { getCanaryStateSafe } from '@/lib/server/canary';
import { readTeamWallet, readToken } from '@/lib/token';

// Matches the 30 s cache of the canary state; the token and the team wallet are fixed at build time.
export const revalidate = 30;
export const maxDuration = 120;

export default async function Home() {
  const state = await getCanaryStateSafe();
  return <CanaryPage initial={state} token={readToken()} teamWallet={readTeamWallet()} />;
}
