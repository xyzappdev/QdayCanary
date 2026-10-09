import type { Metadata } from 'next';
import { Alfa_Slab_One, JetBrains_Mono, Work_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const alfa = Alfa_Slab_One({ weight: '400', subsets: ['latin'], variable: '--font-alfa', display: 'swap' });
const mono = JetBrains_Mono({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-jbm', display: 'swap' });
const work = Work_Sans({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--font-work', display: 'swap' });

const site = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000';

const description =
  'A Solana wallet nobody has a key for. Its address is derived from a public sentence. If its balance ever goes down, Ed25519 is broken. Rebuild the address yourself in your browser.';

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: 'Q-Day Canary',
  description,
  openGraph: { title: 'Q-Day Canary', description, type: 'website', siteName: 'Q-Day Canary' },
  twitter: { card: 'summary_large_image', site: '@QdayCanary', title: 'Q-Day Canary', description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${alfa.variable} ${mono.variable} ${work.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
