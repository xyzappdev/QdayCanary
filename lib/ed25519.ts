// Moved verbatim from reference/qday-canary-reference.html (ED-START … ED-END).
// Only type annotations and the exports were added. The logic is unchanged and is
// checked against @noble/curves and RFC 8032 in tests/ed25519.test.ts.

export type Point = [bigint, bigint];
export type Derivation = {
  n: number;
  input: string;
  digest: Uint8Array;
  A: Point;
  bytes: Uint8Array;
  address: string;
};

/*ED-START*/
export const Ed = (() => {
  const P = 2n ** 255n - 19n;
  const L = 2n ** 252n + 27742317777372353535851937790883648493n;
  const mod = (a: bigint) => { a %= P; return a < 0n ? a + P : a; };
  const pow = (b: bigint, e: bigint) => { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = r * b % P; b = b * b % P; e >>= 1n; } return r; };
  const inv = (a: bigint) => pow(a, P - 2n);
  const D = mod(-121665n * inv(121666n));
  const SQRT_M1 = pow(2n, (P - 1n) / 4n);
  function decompress(bytes: Uint8Array): Point | null {
    let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(bytes[i]);
    const sign = y >> 255n; y &= (1n << 255n) - 1n;
    if (y >= P) return null;
    const y2 = y * y % P, u = mod(y2 - 1n), v = mod(D * y2 + 1n);
    let x = pow(u * inv(v), (P + 3n) / 8n);
    if (mod(x * x % P * v - u) !== 0n) { x = x * SQRT_M1 % P; if (mod(x * x % P * v - u) !== 0n) return null; }
    if (x === 0n && sign === 1n) return null;
    if ((x & 1n) !== sign) x = P - x;
    return [x, y];
  }
  function add(a: Point, b: Point): Point {
    const [x1, y1] = a, [x2, y2] = b;
    const t = D * x1 % P * x2 % P * y1 % P * y2 % P;
    return [mod((x1 * y2 + y1 * x2) * inv(mod(1n + t))), mod((y1 * y2 + x1 * x2) * inv(mod(1n - t)))];
  }
  function mul(k: bigint, p: Point): Point { let r: Point = [0n, 1n], q = p; while (k > 0n) { if (k & 1n) r = add(r, q); q = add(q, q); k >>= 1n; } return r; }
  function compress(p: Point): Uint8Array {
    let v = p[1] | ((p[0] & 1n) << 255n); const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) { out[i] = Number(v & 255n); v >>= 8n; }
    return out;
  }
  const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58(bytes: Uint8Array): string {
    let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b);
    let s = ''; while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n; }
    for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
    return s;
  }
  const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const isIdentity = (p: Point) => p[0] === 0n && p[1] === 1n;
  const inPrimeSubgroup = (p: Point) => isIdentity(mul(L, p));
  async function derive(phrase: string): Promise<Derivation> {
    const enc = new TextEncoder();
    for (let n = 0; n < 256; n++) {
      const input = phrase + '#' + n;
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(input)));
      const pt = decompress(digest);
      if (!pt) continue;
      const A = mul(8n, pt);
      if (A[0] === 0n) continue;
      const bytes = compress(A);
      return { n, input, digest, A, bytes, address: b58(bytes) };
    }
    throw new Error('No curve point found in 256 attempts');
  }
  return { P, L, decompress, add, mul, compress, b58, hex, inPrimeSubgroup, derive };
})();
export const CANARY_PHRASE = 'Q-Day Canary. Solana mainnet. When this wallet moves, Ed25519 is broken.';
/*ED-END*/
