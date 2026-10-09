import { describe, expect, it } from 'vitest';
import { readTeamWallet, readToken } from '@/lib/token';
import { CANARY_ADDRESS } from '@/lib/constants';

// Test-only address: 32 bytes of 0x07. Not a real wallet.
const TEST_TEAM_WALLET = 'US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx';

const CA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('build-time token check', () => {
  it('accepts a valid CA and ticker', () => {
    expect(readToken({ TOKEN_CA: CA, TOKEN_TICKER: '$QDAY' })).toEqual({ ca: CA, ticker: 'QDAY' });
    expect(readToken({ TOKEN_CA: ` ${CA} `, TOKEN_TICKER: 'QDAY' }).ca).toBe(CA);
  });

  it('fails without TOKEN_CA', () => {
    expect(() => readToken({ TOKEN_TICKER: 'QDAY' })).toThrow(/TOKEN_CA is not set/);
    expect(() => readToken({ TOKEN_CA: '  ', TOKEN_TICKER: 'QDAY' })).toThrow(/TOKEN_CA is not set/);
  });

  it('fails on an invalid TOKEN_CA', () => {
    expect(() => readToken({ TOKEN_CA: 'not-a-real-address', TOKEN_TICKER: 'QDAY' })).toThrow(/not a Base58 address/);
    expect(() => readToken({ TOKEN_CA: CA.slice(0, 20), TOKEN_TICKER: 'QDAY' })).toThrow(/not a Base58 address/);
  });

  it('fails without a valid TOKEN_TICKER', () => {
    expect(() => readToken({ TOKEN_CA: CA })).toThrow(/TOKEN_TICKER is not set/);
    expect(() => readToken({ TOKEN_CA: CA, TOKEN_TICKER: 'two words' })).toThrow(/not 1 to 16 letters or digits/);
  });

  describe('production refuses placeholders and wallets', () => {
    const cases = [
      ['the System Program placeholder', '11111111111111111111111111111111'],
      ['the preview placeholder …113', '11111111111111111111111111111113'],
      ['the canary', CANARY_ADDRESS],
      ['the team wallet', TEST_TEAM_WALLET],
    ] as const;
    for (const [name, ca] of cases) {
      it(`${name}: fails on VERCEL_ENV=production`, () => {
        expect(() => readToken({ TOKEN_CA: ca, TOKEN_TICKER: 'QDAY', TEAM_WALLET: TEST_TEAM_WALLET, VERCEL_ENV: 'production' }))
          .toThrow("TOKEN_CA is a placeholder or a wallet, not the coin's mint.");
      });
      it(`${name}: allowed outside production`, () => {
        expect(readToken({ TOKEN_CA: ca, TOKEN_TICKER: 'QDAY' }).ca).toBe(ca);
        expect(readToken({ TOKEN_CA: ca, TOKEN_TICKER: 'QDAY', VERCEL_ENV: 'preview' }).ca).toBe(ca);
      });
    }

    it('a real mint passes on production', () => {
      expect(readToken({ TOKEN_CA: CA, TOKEN_TICKER: 'QDAY', VERCEL_ENV: 'production' }).ca).toBe(CA);
    });
  });
});

describe('team wallet', () => {
  const PROD = { VERCEL_ENV: 'production', TOKEN_CA: CA };

  it('is optional outside production', () => {
    expect(readTeamWallet({})).toBeNull();
    expect(readTeamWallet({ TEAM_WALLET: '  ' })).toBeNull();
    expect(readTeamWallet({ VERCEL_ENV: 'preview' })).toBeNull();
  });

  it('is returned when valid', () => {
    expect(readTeamWallet({ TEAM_WALLET: ` ${TEST_TEAM_WALLET} ` })).toBe(TEST_TEAM_WALLET);
    expect(readTeamWallet({ ...PROD, TEAM_WALLET: TEST_TEAM_WALLET })).toBe(TEST_TEAM_WALLET);
  });

  it('production fails without it', () => {
    expect(() => readTeamWallet(PROD)).toThrow('TEAM_WALLET is not set.');
  });

  it('fails when it is not a 32-byte Base58 address', () => {
    expect(() => readTeamWallet({ ...PROD, TEAM_WALLET: 'not-an-address' })).toThrow(/TEAM_WALLET is not a Base58 address/);
    expect(() => readTeamWallet({ TEAM_WALLET: TEST_TEAM_WALLET.slice(0, 20) })).toThrow(/TEAM_WALLET is not a Base58 address/);
  });

  it('fails when it equals the canary', () => {
    expect(() => readTeamWallet({ ...PROD, TEAM_WALLET: CANARY_ADDRESS })).toThrow(/TEAM_WALLET equals the canary address/);
  });

  it('fails when it equals TOKEN_CA', () => {
    expect(() => readTeamWallet({ ...PROD, TEAM_WALLET: CA })).toThrow(/TEAM_WALLET equals TOKEN_CA/);
  });
});
