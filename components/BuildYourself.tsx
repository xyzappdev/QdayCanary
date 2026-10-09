'use client';

import { useEffect, useRef, useState } from 'react';
import { CANARY_PHRASE, Ed, type Derivation } from '@/lib/ed25519';
import { CANARY_ADDRESS, REPO_URL } from '@/lib/constants';
import { CopyButton } from './CopyButton';

type Checks =
  | { kind: 'running' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; subgroup: boolean; ms: number; same: boolean };

/** One value of the counter: its hash, and why it was skipped (or that it was the one). */
type Try = { n: number; hex: string; result: 'hit' | 'off-curve' | 'small-order' };

const STEP_MS = 450;
const TRY_MS = 220;

async function sha256Hex(s: string) {
  return Ed.hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}

/** Rebuilds the counter values that Ed.derive skipped, for display. Ed.derive itself is untouched. */
async function attempts(phrase: string, d: Derivation): Promise<Try[]> {
  const out: Try[] = [];
  for (let n = 0; n < d.n; n++) {
    const hex = await sha256Hex(phrase + '#' + n);
    const pt = Ed.decompress(Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16))));
    out.push({ n, hex, result: pt ? 'small-order' : 'off-curve' });
  }
  out.push({ n: d.n, hex: Ed.hex(d.digest), result: 'hit' });
  return out;
}

const TRY_LABEL: Record<Try['result'], string> = {
  'off-curve': 'not a curve point',
  'small-order': 'small-order point, skipped',
  hit: 'a curve point',
};

export function BuildYourself() {
  const [phrase, setPhrase] = useState(CANARY_PHRASE);
  const [used, setUsed] = useState(CANARY_PHRASE);
  const [d, setD] = useState<Derivation | null>(null);
  const [tries, setTries] = useState<Try[]>([]);
  const [checks, setChecks] = useState<Checks>({ kind: 'running' });
  // Steps revealed so far. 5 before the first run, so the page reads fine without JavaScript.
  const [shown, setShown] = useState(5);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const runId = useRef(0);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  async function run(p: string) {
    const id = ++runId.current;
    clearTimers();
    setChecks({ kind: 'running' });
    let r: Derivation, t: Try[];
    try {
      r = await Ed.derive(p);
      t = await attempts(p, r);
    } catch (e) {
      if (id !== runId.current) return;
      const m = e instanceof Error && e.message ? e.message : 'no WebCrypto in this view';
      const noCrypto = typeof crypto === 'undefined' || !crypto.subtle;
      setShown(5);
      setChecks({ kind: 'error', message: noCrypto ? 'Derivation needs WebCrypto, which this view does not provide.' : 'Could not derive here: ' + m });
      return;
    }
    if (id !== runId.current) return;
    setD(r);
    setTries(t);
    setUsed(p);

    const finish = () => {
      const t0 = performance.now(), ok = Ed.inPrimeSubgroup(r.A), ms = Math.round(performance.now() - t0);
      setChecks({ kind: 'done', subgroup: ok, ms, same: r.address === CANARY_ADDRESS });
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(5);
      setTimeout(finish, 30);
      return;
    }
    // Reveal the steps one by one; step 2 waits for its list of counter values to play out.
    setShown(0);
    const at = [0, STEP_MS, STEP_MS * 2 + t.length * TRY_MS, STEP_MS * 3 + t.length * TRY_MS, STEP_MS * 4 + t.length * TRY_MS];
    at.forEach((ms, i) => timers.current.push(setTimeout(() => setShown(i + 1), ms)));
    timers.current.push(setTimeout(finish, at[4] + STEP_MS));
  }

  useEffect(() => { run(CANARY_PHRASE); }, []);

  const step = (i: number) => (i < shown ? 'step on' : 'step');
  const done = shown >= 5;
  const yours = d && used !== CANARY_PHRASE;

  return (
    <section id="build">
      <h2>Do not take our word for it. Build the wallet yourself.</h2>
      <p className="sub">Every step below runs in your browser. There is no step where a secret goes in, so there is no secret to come out. Change one letter of the sentence and you get a different wallet.{REPO_URL && <> <a href={`${REPO_URL}/blob/main/lib/ed25519.ts`} target="_blank" rel="noopener noreferrer">Read the code</a>.</>}</p>
      <form className="phrase" onSubmit={(e) => { e.preventDefault(); run(phrase); }}>
        <input type="text" aria-label="Public sentence" spellCheck={false} autoComplete="off" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
        <button className="btn fill" type="submit">Derive</button>
      </form>
      <ol className="steps">
        <li className={step(0)}><div className="body"><h3>Start from a public sentence</h3><p>Anyone can read it. A counter is added at the end.</p><code>{d ? d.input : '…'}</code></div></li>
        <li className={step(1)}><div className="body"><h3>Hash it with SHA-256</h3><p>About half of all hashes are not points on the curve. The counter goes up until one is.{d ? ' This one took ' + (d.n + 1) + (d.n ? ' attempts.' : ' attempt.') : ''}</p>
          <code>
            {d
              ? tries.map((t, i) => (
                  <span key={t.n} className={t.result === 'hit' ? 'try hit' : 'try miss'} style={{ animationDelay: `${i * TRY_MS}ms` }}>
                    #{t.n} {t.hex} · {TRY_LABEL[t.result]}
                  </span>
                ))
              : '…'}
          </code>
        </div></li>
        <li className={step(2)}><div className="body"><h3>Read the 32 bytes as a curve point</h3><p>A point picked by a hash. Nobody chose it, so nobody knows the number that produces it.</p><code>{d ? 'valid point, encoded as ' + Ed.hex(d.digest) : '…'}</code></div></li>
        <li className={step(3)}><div className="body"><h3>Multiply the point by 8</h3><p>This moves it into the group where every real public key lives. Without this step the address would not be a normal public key, and nobody could be sure it can ever be opened.</p><code>{d ? Ed.hex(d.bytes) : '…'}</code></div></li>
        <li className={step(4)}><div className="body"><h3>Write it in Base58</h3><p>That is the Solana address.</p><code>{d ? d.address : '…'}</code></div></li>
      </ol>

      {yours && done && (
        <div className="yours">
          <h3>Your canary</h3>
          <div className="addr">
            <div className="addr-row">
              <span className="addr-label">Derived from your sentence</span>
              <CopyButton text={`${used}\n${d.address}`} selectId="your-canary" label="Copy sentence and address" />
            </div>
            <div className="addr-val" id="your-canary">{d.address}</div>
            <div className="addr-note">From: {used}</div>
          </div>
          <p className="warn">This is not a wallet you can use. Nobody has its key, including you. Anything sent to it is gone.</p>
        </div>
      )}

      <div className="checks" aria-live="polite">
        {(checks.kind === 'running' || (checks.kind === 'done' && !done)) && <span>Running the checks…</span>}
        {checks.kind === 'error' && <span className="fail">{checks.message}</span>}
        {checks.kind === 'done' && done && (
          <>
            <span>On the Ed25519 curve: <b className="pass">yes</b></span>
            <span>In the signing subgroup (order × point = zero): <b className={checks.subgroup ? 'pass' : 'fail'}>{checks.subgroup ? 'yes' : 'no'}</b>, checked here in {checks.ms} ms</span>
            <span>Private key used anywhere: <b className="pass">none</b></span>
            <span>{checks.same ? <>Matches the canary address above: <b className="pass">yes</b></> : 'This is a different wallet from the canary. Your sentence, your point.'}</span>
          </>
        )}
      </div>
    </section>
  );
}
