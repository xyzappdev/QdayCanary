import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { CANARY_PHRASE, Ed } from '@/lib/ed25519';
import { CANARY_ADDRESS } from '@/lib/constants';

const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));
const leToBig = (b: Uint8Array) => b.reduceRight((n, x) => (n << 8n) | BigInt(x), 0n);

describe('derivation', () => {
  it('derives exactly the frozen address with n = 1', async () => {
    const d = await Ed.derive(CANARY_PHRASE);
    expect(d.address).toBe(CANARY_ADDRESS);
    expect(d.n).toBe(1);
    expect(d.input).toBe(CANARY_PHRASE + '#1');
  });

  it('the phrase is frozen', () => {
    expect(CANARY_PHRASE).toBe('Q-Day Canary. Solana mainnet. When this wallet moves, Ed25519 is broken.');
  });

  it('the canary point is in the prime-order subgroup', async () => {
    const d = await Ed.derive(CANARY_PHRASE);
    expect(Ed.inPrimeSubgroup(d.A)).toBe(true);
  });

  it('a different sentence gives a different wallet', async () => {
    const d = await Ed.derive(CANARY_PHRASE.replace('Q-Day', 'Q-day'));
    expect(d.address).not.toBe(CANARY_ADDRESS);
  });
});

describe('RFC 8032, section 7.1, TEST 1', () => {
  const SECRET = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
  const PUBLIC = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
  const BASE = fromHex('58' + '66'.repeat(31));

  it('scalar × base point, compressed, is the RFC public key', () => {
    const h = createHash('sha512').update(fromHex(SECRET)).digest();
    const a = Uint8Array.from(h.subarray(0, 32));
    a[0] &= 248; a[31] &= 127; a[31] |= 64;
    const B = Ed.decompress(BASE)!;
    expect(Ed.hex(Ed.compress(Ed.mul(leToBig(a), B)))).toBe(PUBLIC);
  });

  it('decompress → compress round-trips the RFC public key', () => {
    expect(Ed.hex(Ed.compress(Ed.decompress(fromHex(PUBLIC))!))).toBe(PUBLIC);
  });
});

describe('multiply by 8 agrees with @noble/curves', () => {
  it('on the canary hash point and on 40 other hash points', async () => {
    const enc = new TextEncoder();
    const inputs = [CANARY_PHRASE + '#1', ...Array.from({ length: 200 }, (_, i) => `vector ${i}`)];
    let checked = 0;
    for (const s of inputs) {
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
      const pt = Ed.decompress(digest);
      let noble: InstanceType<typeof ed25519.Point> | null = null;
      try { noble = ed25519.Point.fromBytes(digest); } catch { noble = null; }
      // Both must agree on which hashes are curve points.
      expect(pt === null).toBe(noble === null);
      if (!pt || !noble) continue;
      const ours = Ed.compress(Ed.mul(8n, pt));
      const theirs = noble.multiply(8n).toBytes();
      expect(Ed.hex(ours)).toBe(Ed.hex(theirs));
      // The subgroup check is slow in plain BigInt, so compare it on the first few only.
      if (checked < 5) expect(Ed.inPrimeSubgroup(Ed.mul(8n, pt))).toBe(noble.multiply(8n).isTorsionFree());
      if (++checked > 40) break;
    }
    expect(checked).toBeGreaterThan(40);
  }, 60_000);

  it('the canary address bytes equal 8·P computed by noble', async () => {
    const d = await Ed.derive(CANARY_PHRASE);
    const noble = ed25519.Point.fromBytes(d.digest).multiply(8n);
    expect(Ed.hex(d.bytes)).toBe(Ed.hex(noble.toBytes()));
  });
});
