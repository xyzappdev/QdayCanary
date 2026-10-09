import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { CANARY_ADDRESS, CANARY_PHRASE, REPO_URL } from '@/lib/constants';

// Static: no RPC, no API. Text only.
export const dynamic = 'force-static';

const description =
  'Q-Day Canary is one Solana wallet that nobody can open. This page explains how it was made, why nobody holds its key, and what its death would mean.';

export const metadata: Metadata = {
  title: 'How it works · Q-Day Canary',
  description,
  openGraph: { title: 'How it works · Q-Day Canary', description },
  twitter: { title: 'How it works · Q-Day Canary', description },
};

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** A link into the repository, or plain text when REPO_URL is empty. */
function Repo({ path, children }: { path?: string; children: ReactNode }) {
  if (!REPO_URL) return <>{children}</>;
  return <a href={path ? `${REPO_URL}/blob/main/${path}` : REPO_URL} {...ext}>{children}</a>;
}

const SECTIONS = [
  ['idea', 'The idea'],
  ['q-day', 'What Q-Day breaks on Solana'],
  ['address', 'How the canary address is made'],
  ['times-eight', 'Why multiply by 8'],
  ['no-key', 'Why nobody holds the key'],
  ['death', 'How the site decides the canary is dead'],
  ['limits', 'What the alarm does not tell you'],
  ['bounty', 'Where the bounty comes from'],
  ['check', 'Check it yourself'],
] as const;

function Part({ n, children }: { n: number; children: ReactNode }) {
  const [id, title] = SECTIONS[n - 1];
  return (
    <section className="doc-part" id={id}>
      <div className="doc-num" aria-hidden="true">{n}</div>
      <div className="doc-body">
        <h2><span className="sr">{n}. </span>{title}</h2>
        {children}
      </div>
    </section>
  );
}

export default function HowItWorks() {
  return (
    <div className="wrap">
      <SiteHeader />

      <article className="doc">
        <header className="doc-head">
          <h1>How it works</h1>
          <p className="lede">
            Q-Day Canary is one Solana wallet that nobody can open. This page explains how it was made, why nobody holds
            its key, and what its death would mean.
          </p>
          <nav aria-label="Contents">
            <ol className="toc">
              {SECTIONS.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}
            </ol>
          </nav>
        </header>

        <Part n={1}>
          <p>Miners used to carry a canary underground. The bird reacted to bad air before people did. When it stopped singing, everyone left.</p>
          <p>Q-Day is the day a quantum computer becomes able to break the signatures that protect crypto wallets. Nobody will announce it. Whoever gets there first has every reason to stay quiet and take what they can.</p>
          <p>A canary for Q-Day is a wallet with money in it and no key. It can only be emptied by breaking the signature scheme itself. The moment it moves, everyone knows.</p>
          <p>The idea is not ours. BitMEX Research proposed a canary fund for Bitcoin, where using it as a trigger needs a soft fork. On Solana any program can already read a wallet&apos;s balance, so nothing in the protocol has to change.</p>
        </Part>

        <Part n={2}>
          <p>A Solana wallet is a pair of numbers. The private key is a secret number. The public key is a point on a curve called Ed25519, made by multiplying a fixed base point by that secret number.</p>
          <p>Going forward is easy. Going back, from the point to the number, is believed to be out of reach for ordinary computers. That one way street is all that protects a wallet.</p>
          <p>Shor&apos;s algorithm goes back. A large enough quantum computer running it takes a public key and returns the private key. No machine known today can do this for Ed25519.</p>
          <p>On Solana the address is the public key. There is no hash in front of it. Every address that has ever appeared on chain is already a target waiting for that machine.</p>
        </Part>

        <Part n={3}>
          <p>A normal wallet starts with a secret and derives the address from it. The canary starts with a public sentence and has no secret at any step.</p>
          <ol className="doc-steps">
            <li>Take the sentence and add a counter.<code className="doc-mono">{CANARY_PHRASE}#0</code></li>
            <li>Hash it with SHA-256. The result is 32 bytes that nobody can predict or steer.</li>
            <li>Try to read the 32 bytes as a point on the curve. About half of all hashes are not points. If this one is not, raise the counter and hash again. For the canary the first point appears at counter 1.</li>
            <li>Multiply the point by 8.</li>
            <li>Write the result in Base58. That is the address.<code className="doc-mono">{CANARY_ADDRESS}</code></li>
          </ol>
          <p>Change one letter of the sentence and you get a different wallet. The <Link href="/">main page</Link> runs these steps live in your browser: <Link href="/#build">Build the wallet yourself</Link>.</p>
        </Part>

        <Part n={4}>
          <p>The curve has more points than there are public keys. Its points fall into eight groups of equal size, and every real public key lives in the same one, the group that contains the base point. A point picked by a hash lands there about one time in eight.</p>
          <p>A point outside that group is not the public key of any private key. Whether a signature for such an address could ever be accepted depends on fine details of how the checking code is written. A canary like that might never be able to die, and nobody could be sure.</p>
          <p>Multiplying by 8 removes the doubt. The result always lands in the group where real keys live. The canary address is an ordinary public key in every respect except one: nobody ever knew its private key. Breaking it is exactly as hard as breaking any other wallet.</p>
        </Part>

        <Part n={5}>
          <p>To hold the key we would need the number k for which k times the base point gives the canary&apos;s point. We never had it. We started from the point, and there is no way back to the number. Finding it is the same problem a quantum attacker has to solve.</p>
          <p>Could we have cheated? Trying many sentences does not help. Every sentence gives a point with an unknown number behind it. The only way to cheat is to pick the number first and then find a sentence whose hash lands on its point. That means breaking SHA-256.</p>
          <p>So the sentence is the proof. It reads like plain English, it took two attempts, and anyone can run it again.</p>
        </Part>

        <Part n={6}>
          <p>The site reads the canary from Solana mainnet. The canary counts as dead when a finalized transaction shows either of two things:</p>
          <ul className="doc-list">
            <li>the canary signed it</li>
            <li>the canary&apos;s balance went down</li>
          </ul>
          <p>Both are impossible without a valid signature for the canary&apos;s key. On Solana, SOL leaves a wallet only in a transaction that wallet signed.</p>
          <p>Some things do not count. Anyone can send SOL in. Anyone can mention the address in a transaction of their own. Neither needs the key, so neither kills the canary.</p>
          <p>Only finalized transactions are used, so the result cannot be rolled back. When the site sees the balance fall, it first says that it is checking, finds the exact transaction, and only then says dead.</p>
        </Part>

        <Part n={7}>
          <p>The alarm works in one direction.</p>
          <p>A dead canary means signatures on Solana can no longer be trusted. The cause could be a quantum computer, a flaw in the math or a bug in the code that checks signatures. In every case the right reaction is the same.</p>
          <p>A living canary does not prove that Ed25519 is safe. An attacker who wants to stay hidden will go for the biggest wallets first and leave the canary alone. This is why the bounty matters. The more SOL sits in the canary, the earlier it is worth taking, and the earlier everyone finds out.</p>
          <p>Today the canary is watched by this site. Any program on Solana can read its balance, so a protocol could use the same wallet as an automatic trigger. Nothing like that is built here.</p>
        </Part>

        <Part n={8}>
          <p>Anyone can send SOL to the canary. It cannot come back.</p>
          <p>The coin adds a steady source. Creator fees from trading go to the team wallet, which is a normal wallet with a private key. The team sends half of them on to the canary by hand. This is a promise, not code. You can check it: every transfer into the canary is listed under <Link href="/#fed-by">Fed by</Link> on the <Link href="/">main page</Link> with a link to the transaction, and transfers from the team wallet are marked team.</p>
          <p>The coin does not protect any wallet. It pays for the bounty and for the team.</p>
        </Part>

        <Part n={9}>
          <p>Do not trust this page. Run the derivation.</p>
          <ul className="doc-list">
            <li>In your browser: <Link href="/#build">Build the wallet yourself</Link> on the <Link href="/">main page</Link>.</li>
            <li>
              On your machine, with no dependencies:
              <pre className="doc-pre"><code>{`git clone https://github.com/xyzappdev/QdayCanary
cd QdayCanary
node verify.mjs`}</code></pre>
            </li>
            <li>Read the code on <Repo>GitHub</Repo>. <Repo path="lib/ed25519.ts">lib/ed25519.ts</Repo> runs on the site. <Repo path="verify.mjs">verify.mjs</Repo> is the same procedure written out on its own. Both are checked against each other on every change.</li>
          </ul>
          <p>Ed25519 is safe today. This is the alarm for the day it is not.</p>
          <div className="btns">
            <Link className="btn fill" href="/#build">Build the wallet yourself</Link>
            {REPO_URL && <a className="btn" href={REPO_URL} {...ext}>Read the code</a>}
          </div>
        </Part>
      </article>

      <SiteFooter />
    </div>
  );
}
