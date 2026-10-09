const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decodes Base58 (Bitcoin alphabet). Returns null on any character outside the alphabet. */
export function b58decode(s: string): Uint8Array | null {
  let n = 0n;
  for (const ch of s) {
    const v = A58.indexOf(ch);
    if (v < 0) return null;
    n = n * 58n + BigInt(v);
  }
  const body: number[] = [];
  while (n > 0n) { body.unshift(Number(n & 255n)); n >>= 8n; }
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;
  return Uint8Array.from([...new Array(zeros).fill(0), ...body]);
}

/** A Solana address or mint: Base58 that decodes to exactly 32 bytes. */
export function isValidCa(input: unknown): input is string {
  if (typeof input !== 'string') return false;
  if (input.length < 32 || input.length > 44) return false;
  const bytes = b58decode(input);
  return bytes !== null && bytes.length === 32;
}

/** Optional ticker: letters and digits, up to 16, a leading $ is dropped. */
export function normalizeTicker(input: unknown): string | null | undefined {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input !== 'string') return undefined;
  const t = input.trim().replace(/^\$/, '');
  if (t === '') return null;
  return /^[A-Za-z0-9]{1,16}$/.test(t) ? t : undefined;
}
