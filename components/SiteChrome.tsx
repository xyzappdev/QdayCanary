import Link from 'next/link';
import type { ReactNode } from 'react';
import { REPO_URL, X_HANDLE, X_URL } from '@/lib/constants';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** Header shared by every page. `status` is the live canary plate, shown on the main page only. */
export function SiteHeader({ status }: { status?: ReactNode }) {
  return (
    <header className="top">
      <Link className="mark" href="/">Q-Day Canary</Link>
      <nav className="top-r" aria-label="Site">
        {status}
        <Link className="tag" href="/how-it-works">How it works</Link>
        {REPO_URL && <a className="tag" href={REPO_URL} {...ext}>GitHub</a>}
        <a className="tag" href={X_URL} {...ext}>{X_HANDLE} on X</a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer>
      Ed25519 is safe against every computer known today. Nobody knows when Q-Day comes, or if it does. SOL sent
      to the canary is unrecoverable. <a href={X_URL} {...ext}>{X_HANDLE} on X</a>
      {REPO_URL && <> · <a href={REPO_URL} {...ext}>GitHub</a></>}
    </footer>
  );
}
