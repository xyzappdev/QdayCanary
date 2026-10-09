import { creatorFeeAccounts } from '@/lib/solana/pda';
import { LAMPORTS_PER_SOL } from './classify';
import type { AccountLite, Rpc } from './rpc';

// Rent-exempt minimum per account size. It does not change between refreshes, so it is asked once.
const rentBySpace = new Map<number, number>();

/**
 * Same arithmetic as @pump-fun/pump-sdk getCreatorVaultBalanceBothPrograms:
 * bonding-curve vault lamports above its rent-exempt minimum, plus the wSOL amount in the PumpSwap
 * creator vault ATA. A missing account counts as 0.
 */
export function unclaimedLamports(pumpVault: AccountLite | null, pumpVaultRent: number, ammVaultAta: AccountLite | null): number {
  const curve = pumpVault ? Math.max(0, pumpVault.lamports - pumpVaultRent) : 0;
  const amm = ammVaultAta?.tokenAmount ? Number(ammVaultAta.tokenAmount) : 0;
  return curve + amm;
}

/** Unclaimed creator fees of `creator` in SOL. One getMultipleAccounts call (plus a one-off rent query). */
export async function fetchFeesWaitingSol(rpc: Rpc, creator: string): Promise<number> {
  const { pumpVault, ammVaultAta } = creatorFeeAccounts(creator);
  const [vault, ata] = await rpc.getMultipleAccounts([pumpVault, ammVaultAta]);
  let rent = 0;
  if (vault) {
    rent = rentBySpace.get(vault.space) ?? (await rpc.getMinimumBalanceForRentExemption(vault.space));
    rentBySpace.set(vault.space, rent);
  }
  return unclaimedLamports(vault, rent, ata) / LAMPORTS_PER_SOL;
}
