import { describe, expect, it } from 'vitest';
import { bisectDebit, classify, parseTx, teamTotal, type RawTx } from '@/lib/canary/classify';
import { CANARY_ADDRESS as C } from '@/lib/constants';
import type { TxRecord } from '@/lib/canary/types';
import funding from './fixtures/funding.json';
import debit from './fixtures/debit.json';
import mention from './fixtures/mention.json';
import innerCredit from './fixtures/inner-credit.json';
import failedFee from './fixtures/failed-fee.json';
import signerOnly from './fixtures/signer-only.json';

const SENDER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const rec = (name: string, raw: unknown) => parseTx(name, raw as RawTx, C)!;

const FUND = rec('fund', funding);
const DEBIT = rec('debit', debit);
const MENTION = rec('mention', mention);
const INNER = rec('inner', innerCredit);
const FAILED = rec('failed', failedFee);
const SIGNED = rec('signed', signerOnly);

describe('parseTx', () => {
  it('reads an incoming system transfer and its sender', () => {
    expect(FUND).toMatchObject({ pre: 0, post: 1_000_000_000, from: SENDER, failed: false, slot: 300000100, blockTime: 1760000000 });
  });

  it('finds the sender of a transfer made inside a program call', () => {
    expect(INNER).toMatchObject({ pre: 1_000_000_000, post: 1_250_000_000, from: SENDER });
  });

  it('reads a debit', () => {
    expect(DEBIT.post).toBeLessThan(DEBIT.pre);
  });

  it('reads a mention as no change and no signature', () => {
    expect(MENTION.pre).toBe(MENTION.post);
    expect(MENTION.from).toBeNull();
    expect(MENTION.signer).toBe(false);
  });

  it('reads the signer flag', () => {
    expect(SIGNED.signer).toBe(true);
    expect(SIGNED.pre).toBe(SIGNED.post);
    expect(DEBIT.signer).toBe(true);
    expect(FUND.signer).toBe(false);
    expect(INNER.signer).toBe(false);
  });

  it('returns null when the canary is not in the transaction', () => {
    expect(parseTx('x', funding as unknown as RawTx, 'So11111111111111111111111111111111111111112')).toBeNull();
  });
});

describe('classify', () => {
  it('empty history and zero balance: unfunded', () => {
    expect(classify({ balanceLamports: 0, records: [] })).toMatchObject({ status: 'unfunded', death: null, firstCredit: null });
  });

  it('transactions that only mention the address do not fund it', () => {
    const c = classify({ balanceLamports: 0, records: [MENTION] });
    expect(c.status).toBe('unfunded');
    expect(c.credits).toEqual([]);
    expect(c.firstCredit).toBeNull();
  });

  it('a funding transfer: alive, and it is the first feed', () => {
    const c = classify({ balanceLamports: 1_000_000_000, records: [MENTION, FUND] });
    expect(c.status).toBe('alive');
    expect(c.firstCredit?.signature).toBe('fund');
    expect(c.death).toBeNull();
  });

  it('funding then a debit: dead, and the debit is the death', () => {
    const c = classify({ balanceLamports: 0, records: [DEBIT, FUND] });
    expect(c.status).toBe('dead');
    expect(c.death?.signature).toBe('debit');
  });

  it('the canary as a signer with no balance change: dead', () => {
    const c = classify({ balanceLamports: 1_000_000_000, records: [SIGNED, FUND] });
    expect(c.status).toBe('dead');
    expect(c.death?.signature).toBe('signed');
  });

  it('the address mentioned without its signature: not dead', () => {
    const c = classify({ balanceLamports: 1_000_000_000, records: [MENTION, FUND] });
    expect(c.status).toBe('alive');
    expect(c.death).toBeNull();
  });

  it('a failed transaction that still charged the canary a fee is a death', () => {
    const c = classify({ balanceLamports: 1_249_995_000, records: [FAILED, INNER, FUND] });
    expect(FAILED.failed).toBe(true);
    expect(c.status).toBe('dead');
    expect(c.death?.signature).toBe('failed');
  });

  it('the oldest debit is the death', () => {
    const later = { ...DEBIT, signature: 'later', slot: DEBIT.slot + 10 };
    expect(classify({ balanceLamports: 0, records: [later, DEBIT, FUND] }).death?.signature).toBe('debit');
  });

  it('feeds are newest first', () => {
    const c = classify({ balanceLamports: 1_250_000_000, records: [FUND, INNER] });
    expect(c.credits.map((r) => r.signature)).toEqual(['inner', 'fund']);
  });

  it('a recorded death wins over a clean window', () => {
    expect(classify({ balanceLamports: 1_000_000_000, records: [FUND], recordedDeath: 'sig' }).status).toBe('dead');
  });

  it('zero balance with a recorded birth is not unfunded', () => {
    expect(classify({ balanceLamports: 0, records: [], recordedAliveSince: '2026-01-01T00:00:00.000Z' }).status).toBe('alive');
  });
});

describe('bisectDebit', () => {
  // Balance after each transaction, oldest first. Dust keeps coming in after the drain at index 5.
  const posts = [10, 11, 12, 13, 14, 1, 2, 3, 4, 5, 6, 7];
  const sigs = posts.map((_, i) => `s${i}`);
  const postOf = async (s: string) => posts[Number(s.slice(1))];

  it('finds the transaction that lowered the balance', async () => {
    expect(await bisectDebit(sigs, 9, 7, postOf)).toBe(5);
  });

  it('works when the very first transaction is the debit', async () => {
    expect(await bisectDebit(['a', 'b'], 100, 3, async (s) => (s === 'a' ? 1 : 3))).toBe(0);
  });

  it('returns null when the balance did not fall', async () => {
    expect(await bisectDebit(sigs, 5, 7, postOf)).toBeNull();
  });

  it('uses O(log n) lookups', async () => {
    const n = 100_000, at = 73_123;
    let calls = 0;
    const big = Array.from({ length: n }, (_, i) => String(i));
    const i = await bisectDebit(big, 1_000_000, 50_000, async (s) => {
      calls++;
      const k = Number(s);
      return k < at ? 1_000_000 + k : k - at;
    });
    expect(i).toBe(at);
    expect(calls).toBeLessThanOrEqual(18);
  });
});

describe('teamTotal', () => {
  const TEAM = 'US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx'; // test-only address
  const credit = (sig: string, from: string | null, lamports: number, slot = 1): TxRecord =>
    ({ signature: sig, slot, blockTime: null, failed: false, signer: false, pre: 0, post: lamports, from });

  it('sums only transfers from the team wallet', () => {
    const records = [credit('a', TEAM, 1_500_000_000), credit('b', SENDER, 9_000_000_000), credit('c', TEAM, 500_000_000), credit('d', null, 1)];
    expect(teamTotal(records, TEAM)).toEqual({ sol: 2, count: 2 });
  });

  it('nothing from the team', () => {
    expect(teamTotal([credit('a', SENDER, 1_000_000_000)], TEAM)).toEqual({ sol: 0, count: 0 });
    expect(teamTotal([], TEAM)).toEqual({ sol: 0, count: 0 });
  });

  it('ignores records that are not incoming transfers', () => {
    const debitFromTeam: TxRecord = { ...credit('x', TEAM, 0), pre: 5, post: 0 };
    expect(teamTotal([debitFromTeam, MENTION], TEAM)).toEqual({ sol: 0, count: 0 });
  });
});
