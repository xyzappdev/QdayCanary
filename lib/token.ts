import { isValidCa, normalizeTicker } from './ca';
import { CANARY_ADDRESS } from './constants';

type Env = Record<string, string | undefined>;

/** Placeholders used locally and on preview deployments. Valid addresses, never the coin's mint. */
export const PLACEHOLDER_CAS = ['11111111111111111111111111111111', '11111111111111111111111111111113'];

export type Token = { ca: string; ticker: string };

const isProduction = (env: Env) => env.VERCEL_ENV === 'production';

/**
 * The team wallet comes only from the TEAM_WALLET environment variable, so it is not in the
 * repository. It is a normal wallet with a key: creator of the coin and receiver of its fees.
 *
 * Production (VERCEL_ENV=production) requires it. Elsewhere it may be missing; the site then hides
 * the Creator line and the "team" marks and shows a dash for Fees waiting. When it is set it must be
 * a valid address that is neither the canary nor TOKEN_CA.
 */
export function readTeamWallet(env: Env = process.env): string | null {
  const wallet = env.TEAM_WALLET?.trim() ?? '';
  const problems: string[] = [];
  if (!wallet) {
    if (isProduction(env)) problems.push('TEAM_WALLET is not set.');
  } else if (!isValidCa(wallet)) {
    problems.push('TEAM_WALLET is not a Base58 address that decodes to 32 bytes.');
  } else {
    if (wallet === CANARY_ADDRESS) problems.push('TEAM_WALLET equals the canary address. The canary has no key and cannot be the team wallet.');
    if (wallet === env.TOKEN_CA?.trim()) problems.push("TEAM_WALLET equals TOKEN_CA. The team wallet is a wallet, not the coin's mint.");
  }
  if (problems.length) {
    throw new Error(
      `Q-Day Canary: the team wallet is not configured.\n  ${problems.join('\n  ')}\n` +
        'Set TEAM_WALLET in the Vercel project settings, or in .env.local for local development.',
    );
  }
  return wallet || null;
}

/**
 * The token comes only from TOKEN_CA and TOKEN_TICKER. Both are required: the site must not
 * go out without its contract. next.config.ts calls this, so a missing or invalid value fails
 * `next build` (and `next dev`) before anything is rendered.
 *
 * On a Vercel production deployment (VERCEL_ENV=production) the placeholders, the canary and the team
 * wallet are refused as well. NODE_ENV is not used for this: it is "production" for every `next build`,
 * including a local one with the .env.local placeholder.
 */
export function readToken(env: Env = process.env): Token {
  const ca = env.TOKEN_CA?.trim() ?? '';
  const ticker = normalizeTicker(env.TOKEN_TICKER);
  const notAMint = new Set([...PLACEHOLDER_CAS, CANARY_ADDRESS, env.TEAM_WALLET?.trim()].filter(Boolean));
  const problems: string[] = [];
  if (!ca) problems.push('TOKEN_CA is not set.');
  else if (!isValidCa(ca)) problems.push(`TOKEN_CA "${ca}" is not a Base58 address that decodes to 32 bytes.`);
  else if (isProduction(env) && notAMint.has(ca)) problems.push("TOKEN_CA is a placeholder or a wallet, not the coin's mint.");
  if (!ticker) problems.push(`TOKEN_TICKER ${env.TOKEN_TICKER ? `"${env.TOKEN_TICKER}" is not 1 to 16 letters or digits` : 'is not set'}.`);
  if (problems.length) {
    throw new Error(
      `Q-Day Canary: the token is not configured.\n  ${problems.join('\n  ')}\n` +
        'Set TOKEN_CA and TOKEN_TICKER in the Vercel project settings, or in .env.local for local development.',
    );
  }
  return { ca, ticker: ticker! };
}
