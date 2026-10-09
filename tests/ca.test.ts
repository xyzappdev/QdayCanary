import { describe, expect, it } from 'vitest';
import { b58decode, isValidCa, normalizeTicker } from '@/lib/ca';
import { CANARY_ADDRESS } from '@/lib/constants';
import { Ed } from '@/lib/ed25519';

describe('CA validator', () => {
  it('accepts valid 32-byte addresses', () => {
    expect(isValidCa(CANARY_ADDRESS)).toBe(true);
    expect(isValidCa('So11111111111111111111111111111111111111112')).toBe(true); // wrapped SOL mint
    expect(isValidCa('11111111111111111111111111111111')).toBe(true); // system program, 32 zero bytes
    expect(isValidCa('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true); // USDC mint
  });

  it('round-trips with the Ed module encoder', () => {
    const bytes = b58decode(CANARY_ADDRESS)!;
    expect(bytes.length).toBe(32);
    expect(Ed.b58(bytes)).toBe(CANARY_ADDRESS);
  });

  it('rejects garbage', () => {
    expect(isValidCa('')).toBe(false);
    expect(isValidCa('not a contract address at all, sorry!!')).toBe(false);
    expect(isValidCa('0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl')).toBe(false); // 0, O, I, l are not Base58
    expect(isValidCa(' ' + CANARY_ADDRESS)).toBe(false);
    expect(isValidCa(42)).toBe(false);
    expect(isValidCa(null)).toBe(false);
    expect(isValidCa({ ca: CANARY_ADDRESS })).toBe(false);
  });

  it('rejects the wrong length', () => {
    expect(isValidCa(Ed.b58(new Uint8Array(31).fill(255)))).toBe(false); // 31 bytes
    expect(isValidCa(Ed.b58(new Uint8Array(33).fill(7)))).toBe(false); // 33 bytes
    expect(isValidCa(CANARY_ADDRESS.slice(0, 20))).toBe(false); // too short
    expect(isValidCa(CANARY_ADDRESS + '1')).toBe(false); // 45 characters
    expect(isValidCa('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(false); // 44 chars, 33 bytes
    // A transaction signature is 64 bytes.
    expect(isValidCa('5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW')).toBe(false);
  });
});

describe('ticker', () => {
  it('normalizes and validates', () => {
    expect(normalizeTicker(undefined)).toBe(null);
    expect(normalizeTicker('')).toBe(null);
    expect(normalizeTicker('$QDAY')).toBe('QDAY');
    expect(normalizeTicker('bad ticker')).toBe(undefined);
    expect(normalizeTicker('A'.repeat(17))).toBe(undefined);
  });
});
