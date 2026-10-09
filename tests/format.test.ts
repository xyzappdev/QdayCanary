import { describe, expect, it } from 'vitest';
import { teamLineParts } from '@/components/format';

const line = (sol: number, count: number, complete: boolean, truncated = false) => teamLineParts({ sol, count, complete }, truncated).join('');

describe('From the team line', () => {
  it('history fully read', () => {
    expect(line(2.5, 3, true)).toBe('From the team: 2.5 SOL in 3 transfers.');
    expect(line(1, 1, true)).toBe('From the team: 1 SOL in 1 transfer.');
    expect(line(2.5, 3, true, true)).toBe('From the team: 2.5 SOL in 3 transfers in the newest 1,000 transactions.');
  });

  it('nothing from the team, history fully read', () => {
    expect(line(0, 0, true)).toBe('The team has not sent anything yet.');
    expect(line(0, 0, true, true)).toBe('The team has not sent anything in the newest 1,000 transactions.');
  });

  it('still reading history', () => {
    expect(line(2.5, 3, false)).toBe('From the team: at least 2.5 SOL in 3 transfers. Still reading history.');
    expect(line(2.5, 3, false, true)).toBe('From the team: at least 2.5 SOL in 3 transfers in the newest 1,000 transactions. Still reading history.');
  });

  it('nothing found yet while still reading history', () => {
    expect(line(0, 0, false)).toBe('From the team: nothing found yet. Still reading history.');
    expect(line(0, 0, false, true)).toBe('From the team: nothing found yet. Still reading history.');
  });

  it('links only the words "the team"', () => {
    expect(teamLineParts({ sol: 0, count: 0, complete: false }, false)[1]).toBe('the team');
    expect(teamLineParts({ sol: 0, count: 0, complete: true }, false)[1]).toBe('The team');
  });
});
