import type { Status } from '@/lib/canary/types';

const DAY = 86_400_000;

export function fmtSol(sol: number): string {
  return sol.toLocaleString('en-US', { maximumFractionDigits: sol >= 1 ? 4 : 9 });
}

/** Day 1 is the day of the first feed. */
export function dayNumber(aliveSince: string, now: number): number {
  return Math.max(1, Math.floor((now - Date.parse(aliveSince)) / DAY) + 1);
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hms = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d ? `${d}d ${hms}` : hms;
}

/** Same string on server and client: UTC, minute precision. */
export function fmtTime(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ') + ' UTC';
}

export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export const DROP_LABEL = 'Balance fell. Checking.';
export const DROP_WARNING =
  "The canary's balance went down and the site is still looking for the transaction. Treat this as a warning.";

export function plate(status: Status | null, aliveSince: string | null, now: number, dropUnresolved = false): string {
  if (status === 'dead') return 'Dead';
  if (dropUnresolved) return DROP_LABEL;
  if (status === 'unfunded') return 'Not funded yet';
  if (status === 'alive') return aliveSince ? `Alive · day ${dayNumber(aliveSince, now)}` : 'Alive';
  return 'Status unavailable';
}

export type TeamTotalView = { sol: number; count: number; complete: boolean };

/**
 * The "From the team" line in three parts: text before the link, the linked words, text after.
 * Counts every transfer the site has read, not only the 10 shown. While the window is not fully
 * parsed yet the sum is a lower bound.
 */
export function teamLineParts(team: TeamTotalView, truncated: boolean): [string, string, string] {
  const scope = truncated ? ' in the newest 1,000 transactions' : '';
  const transfers = `${team.count} ${team.count === 1 ? 'transfer' : 'transfers'}`;
  if (!team.complete) {
    if (team.count === 0) return ['From ', 'the team', ': nothing found yet. Still reading history.'];
    return ['From ', 'the team', `: at least ${fmtSol(team.sol)} SOL in ${transfers}${scope}. Still reading history.`];
  }
  if (team.count === 0) return ['', 'The team', ` has not sent anything ${truncated ? scope.trim() : 'yet'}.`];
  return ['From ', 'the team', `: ${fmtSol(team.sol)} SOL in ${transfers}${scope}.`];
}
