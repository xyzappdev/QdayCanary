import { CopyButton } from './CopyButton';
import Link from 'next/link';
import { solscanToken, X_HANDLE, X_URL } from '@/lib/constants';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function Why() {
  return (
    <section>
      <h2>Why a wallet works as an alarm</h2>
      <div className="facts">
        <div><h3>Only a signature moves SOL out</h3><p>Anyone can send SOL in. Taking it out needs a valid Ed25519 signature for this exact address.</p></div>
        <div><h3>Any program can read the balance</h3><p>A contract can read this account&apos;s balance and compare it with the last value it stored. No oracle, no committee.</p></div>
        <div><h3>So a drop is proof</h3><p>If the balance falls, someone produced a signature for a key that was never made. The curve is broken and every program can react.</p></div>
      </div>
      <p className="sub">Want the long version? <Link href="/how-it-works">Read how it works.</Link></p>
    </section>
  );
}

export function TokenSection({ ca, ticker, teamWallet }: { ca: string; ticker: string; teamWallet: string | null }) {
  return (
    <section>
      <h2>Token · ${ticker}</h2>
      <div className="addr">
        <div className="addr-row"><span className="addr-label">${ticker} · contract address</span><CopyButton text={ca} selectId="token-ca" /></div>
        <div className="addr-val" id="token-ca">{ca}</div>
      </div>
      {teamWallet && <p className="sub">Creator: <span className="mono">{teamWallet}</span> (team wallet)</p>}
      <div className="links">
        <a href={`https://pump.fun/coin/${ca}`} {...ext}>pump.fun</a>
        <a href={`https://dexscreener.com/solana/${ca}`} {...ext}>DexScreener</a>
        <a href={solscanToken(ca)} {...ext}>Solscan</a>
      </div>
      <p className="sub">The coin does not protect your wallet. Half of its creator fees feed the canary.</p>
      <p className="sub">Only trust the contract on this page and on <a href={X_URL} {...ext}>{X_HANDLE}</a>.</p>
    </section>
  );
}

export function Bounty() {
  return (
    <section className="plan">
      <h2>Where the bounty comes from</h2>
      <p>
        Anyone can send SOL to the canary. Creator fees from the coin go to the team wallet, which is a normal
        wallet with a key. Half of them is sent on to the canary. Those transfers show up in Fed by, marked team.
      </p>
    </section>
  );
}

export function Faq() {
  return (
    <section>
      <h2>Questions</h2>
      <div>
        <details><summary>Is Solana broken today?</summary><p>No. Ed25519 is safe against every computer that exists. The canary is for the day that stops being true, whenever that is, if it ever comes.</p></details>
        <details><summary>Can the people behind this take the money?</summary><p>No. They never had a key. They hashed a sentence, exactly as you did above.</p></details>
        <details><summary>Why this address?</summary><p>Nobody picked it. It is what the public sentence hashes to. Change one letter and you get a different address.</p></details>
        <details><summary>So SOL sent to the canary is gone?</summary><p>Until someone breaks the curve, yes. Treat it as a burn that pays a bounty.</p></details>
        <details><summary>Where do the coin&apos;s fees go?</summary><p>To the team wallet, a normal wallet with a key. The team keeps half and sends half to the canary. Every transfer to the canary is listed in Fed by.</p></details>
        <details><summary>Would a real attacker bother with it?</summary><p>Maybe not at first. A quiet attacker goes for the biggest wallets. The bigger the bounty, the earlier the canary is worth taking, and the earlier everyone finds out.</p></details>
        <details><summary>Is this a new idea?</summary><p>No. BitMEX Research proposed a canary fund for Bitcoin, where it needs a soft fork. On Solana a program can already read the canary&apos;s balance, so nothing in the protocol has to change.</p></details>
      </div>
    </section>
  );
}
