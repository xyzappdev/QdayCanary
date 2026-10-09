#!/usr/bin/env node
// Rebuilds the Q-Day Canary address from its public sentence. No dependencies: node:crypto and BigInt.
// Same procedure as lib/ed25519.ts (the code the website runs), written out again so it can be read
// and run on its own:
//   1. SHA-256(sentence + '#' + n), n = 0, 1, 2, ...
//   2. the first hash that decodes to a point on the Ed25519 curve
//   3. that point multiplied by 8
//   4. the compressed point in Base58: the Solana address
//
// Usage:
//   node verify.mjs                  rebuild the canary and compare with the published address
//   node verify.mjs "any sentence"   derive the address for your own sentence

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const CANARY_PHRASE = 'Q-Day Canary. Solana mainnet. When this wallet moves, Ed25519 is broken.';
export const CANARY_ADDRESS = 'AHiGL7feQqEko3yiDNCi7LJEviQKRbsT7joWn29zym9g';

const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const mod = (a) => { a %= P; return a < 0n ? a + P : a; };
const pow = (b, e) => { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = r * b % P; b = b * b % P; e >>= 1n; } return r; };
const inv = (a) => pow(a, P - 2n);
const D = mod(-121665n * inv(121666n));
const SQRT_M1 = pow(2n, (P - 1n) / 4n);

/** 32 little-endian bytes to a curve point [x, y], or null if they are not a point. */
function decompress(bytes) {
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

function add(a, b) {
  const [x1, y1] = a, [x2, y2] = b;
  const t = D * x1 % P * x2 % P * y1 % P * y2 % P;
  return [mod((x1 * y2 + y1 * x2) * inv(mod(1n + t))), mod((y1 * y2 + x1 * x2) * inv(mod(1n - t)))];
}

function mul(k, p) { let r = [0n, 1n], q = p; while (k > 0n) { if (k & 1n) r = add(r, q); q = add(q, q); k >>= 1n; } return r; }

function compress(p) {
  let v = p[1] | ((p[0] & 1n) << 255n); const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) { out[i] = Number(v & 255n); v >>= 8n; }
  return out;
}

const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) {
  let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = ''; while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const isIdentity = (p) => p[0] === 0n && p[1] === 1n;
export const inPrimeSubgroup = (p) => isIdentity(mul(L, p));

/** The derivation. Returns the counter n, the hash, the point times 8 and the address. */
export function derive(phrase) {
  for (let n = 0; n < 256; n++) {
    const input = phrase + '#' + n;
    const digest = new Uint8Array(createHash('sha256').update(input, 'utf8').digest());
    const pt = decompress(digest);
    if (!pt) continue;
    const A = mul(8n, pt);
    if (A[0] === 0n) continue;
    const bytes = compress(A);
    return { n, input, digest: hex(digest), point: hex(bytes), A, address: b58(bytes) };
  }
  throw new Error('No curve point found in 256 attempts');
}

function main(argv) {
  const own = argv.length > 0;
  const phrase = own ? argv.join(' ') : CANARY_PHRASE;
  const d = derive(phrase);
  console.log(`sentence  ${phrase}`);
  console.log(`n         ${d.n}`);
  console.log(`sha256    ${d.digest}`);
  console.log(`8 x point ${d.point}`);
  console.log(`address   ${d.address}`);
  if (own) {
    console.log('');
    console.log('Nobody holds the key to this address, including you. Anything sent to it is gone.');
    return 0;
  }
  if (d.address === CANARY_ADDRESS) {
    console.log(`MATCH     ${CANARY_ADDRESS}`);
    return 0;
  }
  console.log(`MISMATCH  expected ${CANARY_ADDRESS}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
