import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CANARY_PHRASE, Ed } from '@/lib/ed25519';
import { CANARY_ADDRESS } from '@/lib/constants';
// verify.mjs is plain JavaScript with no type declarations, on purpose: it must stay one file.
// @ts-expect-error no declaration file
import * as verify from '../verify.mjs';

type VerifyDerivation = { n: number; input: string; digest: string; point: string; address: string };
const v = verify as { derive: (p: string) => VerifyDerivation; CANARY_ADDRESS: string; CANARY_PHRASE: string };

async function same(phrase: string) {
  const ours = await Ed.derive(phrase);
  const theirs = v.derive(phrase);
  expect(theirs.n).toBe(ours.n);
  expect(theirs.input).toBe(ours.input);
  expect(theirs.digest).toBe(Ed.hex(ours.digest));
  expect(theirs.point).toBe(Ed.hex(ours.bytes));
  expect(theirs.address).toBe(ours.address);
}

describe('verify.mjs agrees with lib/ed25519.ts', () => {
  it('uses the same frozen sentence and address', () => {
    expect(v.CANARY_PHRASE).toBe(CANARY_PHRASE);
    expect(v.CANARY_ADDRESS).toBe(CANARY_ADDRESS);
  });

  it('on the canary', async () => {
    await same(CANARY_PHRASE);
    expect(v.derive(CANARY_PHRASE).address).toBe(CANARY_ADDRESS);
  });

  it('on 20 random sentences', async () => {
    for (let i = 0; i < 20; i++) await same(`random ${i} ${randomBytes(12).toString('base64')}`);
  });
});

describe('node verify.mjs', () => {
  it('prints MATCH and exits 0 for the canary', () => {
    const out = execFileSync(process.execPath, ['verify.mjs'], { encoding: 'utf8' });
    expect(out).toContain(`MATCH     ${CANARY_ADDRESS}`);
    expect(out).toContain('n         1');
  });

  it('derives your own sentence and warns that nobody holds its key', () => {
    const out = execFileSync(process.execPath, ['verify.mjs', 'My own canary. Solana mainnet.'], { encoding: 'utf8' });
    expect(out).toContain('address   ');
    expect(out).not.toContain(CANARY_ADDRESS);
    expect(out).toContain('Nobody holds the key to this address, including you. Anything sent to it is gone.');
  });
});
