import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  associatedTokenAddress, ATA_PROGRAM, creatorFeeAccounts, findProgramAddress,
  PUMP_AMM_PROGRAM, PUMP_PROGRAM, TOKEN_PROGRAM, WSOL_MINT,
} from '@/lib/solana/pda';
import { fetchFeesWaitingSol, unclaimedLamports } from '@/lib/canary/fees';
import type { AccountLite, Rpc } from '@/lib/canary/rpc';
import { CANARY_ADDRESS } from '@/lib/constants';

// Test-only address: 32 bytes of 0x07. Not a real wallet.
const TEST_TEAM_WALLET = 'US517G5965aydkZ46HS38QLi7UQiSojurfbQfKCELFx';

const ref = (seeds: Buffer[], program: string) => PublicKey.findProgramAddressSync(seeds, new PublicKey(program))[0].toBase58();
const pk = (a: string) => new PublicKey(a).toBuffer();

describe('PDA derivation matches @solana/web3.js', () => {
  for (const creator of [TEST_TEAM_WALLET, CANARY_ADDRESS, 'So11111111111111111111111111111111111111112']) {
    it(`creator vaults for ${creator.slice(0, 6)}…`, () => {
      const ours = creatorFeeAccounts(creator);
      expect(ours.pumpVault).toBe(ref([Buffer.from('creator-vault'), pk(creator)], PUMP_PROGRAM));
      const auth = ref([Buffer.from('creator_vault'), pk(creator)], PUMP_AMM_PROGRAM);
      expect(ours.ammVaultAuthority).toBe(auth);
      expect(ours.ammVaultAta).toBe(ref([pk(auth), pk(TOKEN_PROGRAM), pk(WSOL_MINT)], ATA_PROGRAM));
    });
  }

  it('ATA and arbitrary seeds', () => {
    expect(associatedTokenAddress(TEST_TEAM_WALLET, WSOL_MINT)).toBe(ref([pk(TEST_TEAM_WALLET), pk(TOKEN_PROGRAM), pk(WSOL_MINT)], ATA_PROGRAM));
    for (let i = 0; i < 30; i++) {
      const seed = `seed-${i}`;
      expect(findProgramAddress([seed], PUMP_PROGRAM)).toBe(ref([Buffer.from(seed)], PUMP_PROGRAM));
    }
  });
});

const acct = (lamports: number, tokenAmount: string | null = null, space = 0): AccountLite => ({ lamports, space, tokenAmount });

describe('unclaimed creator fees', () => {
  it('no accounts: 0', () => {
    expect(unclaimedLamports(null, 0, null)).toBe(0);
  });

  it('bonding-curve vault counts lamports above rent', () => {
    expect(unclaimedLamports(acct(890_880 + 1_500_000_000), 890_880, null)).toBe(1_500_000_000);
    expect(unclaimedLamports(acct(500_000), 890_880, null)).toBe(0);
  });

  it('PumpSwap vault counts the wSOL token amount, not its lamports', () => {
    expect(unclaimedLamports(null, 0, acct(2_039_280 + 700_000_000, '700000000', 165))).toBe(700_000_000);
  });

  it('adds both', async () => {
    const rpc = {
      async getMultipleAccounts() { return [acct(890_880 + 250_000_000), acct(2_039_280 + 750_000_000, '750000000', 165)]; },
      async getMinimumBalanceForRentExemption() { return 890_880; },
    } as unknown as Rpc;
    expect(await fetchFeesWaitingSol(rpc, TEST_TEAM_WALLET)).toBe(1);
  });
});
