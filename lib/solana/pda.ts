import { createHash } from 'node:crypto';
import { b58decode } from '@/lib/ca';
import { Ed } from '@/lib/ed25519';

// Program ids and seeds are taken from pump.fun's public IDLs (pump-fun/pump-public-docs, idl/pump.json
// and idl/pump_amm.json) and match @pump-fun/pump-sdk 4.0.0 (creatorVaultPda, coinCreatorVaultAuthorityPda,
// coinCreatorVaultAtaPda).
export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_AMM_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export function pubkeyBytes(address: string): Uint8Array {
  const b = b58decode(address);
  if (!b || b.length !== 32) throw new Error(`not a 32-byte address: ${address}`);
  return b;
}

/** Solana's findProgramAddress: the first bump from 255 down whose hash is not a curve point. */
export function findProgramAddress(seeds: (string | Uint8Array)[], programId: string): string {
  const program = pubkeyBytes(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const h = createHash('sha256');
    for (const s of seeds) h.update(typeof s === 'string' ? Buffer.from(s, 'utf8') : s);
    h.update(Uint8Array.of(bump));
    h.update(program);
    h.update('ProgramDerivedAddress');
    const digest = new Uint8Array(h.digest());
    if (!Ed.decompress(digest)) return Ed.b58(digest);
  }
  throw new Error('no viable bump');
}

export const associatedTokenAddress = (owner: string, mint: string, tokenProgram = TOKEN_PROGRAM) =>
  findProgramAddress([pubkeyBytes(owner), pubkeyBytes(tokenProgram), pubkeyBytes(mint)], ATA_PROGRAM);

/** Where a creator's uncollected fees sit: native SOL on the bonding curve, wSOL on PumpSwap. */
export function creatorFeeAccounts(creator: string) {
  const pumpVault = findProgramAddress(['creator-vault', pubkeyBytes(creator)], PUMP_PROGRAM);
  const ammVaultAuthority = findProgramAddress(['creator_vault', pubkeyBytes(creator)], PUMP_AMM_PROGRAM);
  const ammVaultAta = associatedTokenAddress(ammVaultAuthority, WSOL_MINT);
  return { pumpVault, ammVaultAuthority, ammVaultAta };
}
