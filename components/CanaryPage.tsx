'use client';

import { useEffect, useState } from 'react';
import type { CanaryState } from '@/lib/canary/types';
import type { Token } from '@/lib/token';
import { CANARY_ADDRESS, solscanAccount, solscanTx, X_HANDLE, X_URL } from '@/lib/constants';
import { CANARY_PHRASE, Ed } from '@/lib/ed25519';
import { BuildYourself } from './BuildYourself';
import { Cage } from './Cage';
import { CopyButton } from './CopyButton';
import { DROP_LABEL, DROP_WARNING, fmtDuration, fmtSol, fmtTime, plate, short } from './format';
import { Bounty, Faq, Footer, TokenSection, Why } from './Sections';

const POLL_MS = 30_000;
const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

type Derived = { kind: 'pending' } | { kind: 'ok'; address: string } | { kind: 'mismatch'; address: string } | { kind: 'nocrypto' };

export function CanaryPage({ initial, token, teamWallet }: { initial: CanaryState | null; token: Token; teamWallet: string | null }) {
  const [state, setState] = useState(initial);
  const [sim, setSim] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [derived, setDerived] = useState<Derived>({ kind: 'pending' });

  // Live data: poll the cached API. A real death turns the page to ash on the next poll.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/canary', { cache: 'no-store' });
        if (res.ok && alive) setState((await res.json()) as CanaryState);
      } catch { /* keep the last good state */ }
    };
    if (!initial) load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [initial]);

  // The address shown at the top is recomputed here and must equal the published one.
  useEffect(() => {
    Ed.derive(CANARY_PHRASE).then(
      (d) => setDerived(d.address === CANARY_ADDRESS ? { kind: 'ok', address: d.address } : { kind: 'mismatch', address: d.address }),
      () => setDerived({ kind: 'nocrypto' }),
    );
  }, []);

  const realDead = state?.status === 'dead';
  const ash = realDead || sim;
  const status = state?.status ?? null;
  const dropping = !realDead && !!state?.balanceDropUnresolved;
  const feedShown = feedOpen && !ash && derived.kind !== 'mismatch';

  return (
    <div className={ash ? 'wrap is-dead' : 'wrap'}>
      <header className="top">
        <div className="mark">Q-Day Canary</div>
        <div className="top-r">
          <Plate status={status} aliveSince={state?.aliveSince ?? null} dropping={dropping} />
          <a className="tag" href={X_URL} {...ext}>{X_HANDLE} on X</a>
        </div>
      </header>

      <section className={feedShown ? 'hero feed-open' : 'hero'}>
        <div className="hero-copy">
          <h1>{ash ? 'The canary is dead.' : 'This wallet has no private key.'}</h1>
          {realDead ? (
            <p className="lede">
              Someone signed for a wallet that never had a key. <b>Ed25519 is broken.</b> Every Solana wallet is now open to whoever did it.{' '}
              {state?.deathTx && <a href={solscanTx(state.deathTx)} {...ext}>See the transaction on Solscan.</a>}
            </p>
          ) : sim ? (
            <p className="lede">Someone just signed for a wallet that never had a key. <b>Ed25519 is broken.</b> Every Solana wallet is now open to whoever did it. This is the simulation of that moment.</p>
          ) : (
            <p className="lede">Nobody made one, so nobody can leak it, sell it or lose it. The only way to move what is inside is to <b>break Ed25519</b>, the signature every Solana wallet depends on. When this wallet moves, Q-Day has happened.</p>
          )}

          <div className="addr">
            <div className="addr-row">
              <span className="addr-label">The canary · Solana address</span>
              <CopyButton text={derived.kind === 'ok' ? derived.address : null} selectId="addr" />
            </div>
            <div className="addr-val" id="addr">
              {derived.kind === 'pending' ? 'deriving in your browser…' : derived.kind === 'nocrypto' ? 'Could not derive in this view' : derived.address}
            </div>
            {derived.kind === 'mismatch' ? (
              <div className="addr-warn" role="alert">
                This page derived a different address from the published one ({CANARY_ADDRESS}). Something is wrong with this copy of the site. Do not send anything.
              </div>
            ) : (
              <div className="addr-note">
                {derived.kind === 'nocrypto'
                  ? 'This browser view has no WebCrypto. Open the page in a normal browser tab.'
                  : 'Derived on this page from a public sentence. Scroll down and rebuild it yourself.'}
              </div>
            )}
          </div>

          {dropping && <p className="alert" role="alert">{DROP_WARNING}</p>}

          <dl className="stats">
            <div><dt>Status</dt><dd className={ash || dropping ? 'st-dead' : status === 'alive' ? 'st-alive' : undefined}>{ash ? 'Dead' : dropping ? DROP_LABEL : status === 'alive' ? 'Alive' : status === 'unfunded' ? 'Not funded' : '—'}</dd></div>
            <div><dt>Bounty</dt><dd>{state?.balanceSol != null ? `${fmtSol(state.balanceSol)} SOL` : '—'}</dd></div>
            <div><dt>Alive for</dt><dd suppressHydrationWarning>{status === 'alive' && state?.aliveSince ? <AliveFor since={state.aliveSince} /> : '—'}</dd></div>
            <div><dt>Ed25519</dt><dd>{ash ? 'Broken' : 'Holding'}</dd></div>
            <div>
              <dt>Fees waiting</dt>
              <dd>{state?.feesWaitingSol != null ? `${fmtSol(state.feesWaitingSol)} SOL` : '—'}</dd>
              <dd className="note">Unclaimed creator fees of the team wallet. Half goes to the canary.</dd>
            </div>
          </dl>

          {!realDead && !sim && (
            <div className="btn-sim">
              {derived.kind !== 'mismatch' && (
                <button className="btn" type="button" aria-expanded={feedOpen} aria-controls="feedbox" onClick={() => setFeedOpen((o) => !o)}>Feed the canary</button>
              )}
              <button className="btn fill" type="button" onClick={() => setSim(true)}>Simulate Q-Day</button>
            </div>
          )}
          {sim && <span className="sim">simulation · real numbers are unchanged</span>}

        </div>

        <div className="cage-col">
          <Cage />
          {sim && <button className="btn" type="button" onClick={() => setSim(false)}>Bring it back</button>}
        </div>

        {/* Its own grid row, so opening it does not re-centre the cage. */}
        {feedShown && (
          <div className="feedbox" id="feedbox">
            {derived.kind === 'ok' ? (
              <p className="sub">Send SOL from any wallet to the canary address above. <a href={solscanAccount(CANARY_ADDRESS)} {...ext}>View it on Solscan</a></p>
            ) : (
              // No address above to copy (still deriving, or no WebCrypto): show the published one here.
              <div className="addr">
                <div className="addr-row"><span className="addr-label">Send SOL to</span><CopyButton text={CANARY_ADDRESS} selectId="feed-addr" /></div>
                <div className="addr-val" id="feed-addr">{CANARY_ADDRESS}</div>
                <div className="addr-note"><a href={solscanAccount(CANARY_ADDRESS)} {...ext}>View on Solscan</a></div>
              </div>
            )}
            <p className="warn">SOL sent to this address cannot be recovered by anyone, including us. It is a bounty for whoever breaks Ed25519.</p>
          </div>
        )}
      </section>

      <BuildYourself />
      <Why />
      <FedBy state={state} teamWallet={teamWallet} />
      <TokenSection ca={token.ca} ticker={token.ticker} teamWallet={teamWallet} />
      <Bounty />
      <Faq />
      <Footer />
    </div>
  );
}

function FedBy({ state, teamWallet }: { state: CanaryState | null; teamWallet: string | null }) {
  const feeds = state?.feeds ?? [];
  return (
    <section>
      <h2>Fed by</h2>
      {!state ? (
        <p className="sub">Could not reach Solana right now. This list will fill in on its own.</p>
      ) : feeds.length === 0 ? (
        <p className="sub">Nobody has fed the canary yet.</p>
      ) : (
        <>
          <p className="sub">The latest transfers into the canary, read from Solana mainnet.{state.historyTruncated ? ' Only the newest 1,000 transactions are read.' : ''}</p>
          <ol className="feeds">
            {feeds.map((f) => (
              <li key={f.signature}>
                <span className="who">
                  {f.from ? <a href={solscanAccount(f.from)} {...ext}>{short(f.from)}</a> : 'unknown sender'}
                  {teamWallet && f.from === teamWallet && <span className="team">team</span>}
                </span>
                <span className="amt">+{fmtSol(f.amountSol)} SOL</span>
                <span className="meta">
                  {f.time && <span>{fmtTime(f.time)}</span>}
                  <a href={solscanTx(f.signature)} {...ext}>{short(f.signature)}</a>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function Plate({ status, aliveSince, dropping }: { status: CanaryState['status'] | null; aliveSince: string | null; dropping: boolean }) {
  const now = useNow();
  return <div className="tag" suppressHydrationWarning>{plate(status, aliveSince, now, dropping)}</div>;
}

function AliveFor({ since }: { since: string }) {
  const now = useNow();
  return <>{fmtDuration(now - Date.parse(since))}</>;
}

/** Ticks once a second for the "Alive for" timer. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
