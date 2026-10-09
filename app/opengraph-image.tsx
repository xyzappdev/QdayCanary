import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CANARY_ADDRESS } from '@/lib/constants';
import { getCanaryStateSafe } from '@/lib/server/canary';
import { dayNumber, DROP_LABEL, fmtSol } from '@/components/format';

export const alt = 'Q-Day Canary: a Solana wallet nobody has a key for';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 300;
export const maxDuration = 120;

const BIRD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="50 136 132 84"><g fill="INK"><polygon points="94,186 56,168 62,198"/><ellipse cx="118" cy="182" rx="31" ry="24"/><circle cx="146" cy="156" r="17"/><polygon points="160,150 178,157 160,164"/></g><path d="M100 180 Q114 196 130 182" stroke="BG" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle fill="BG" cx="150" cy="152" r="3"/><path d="M111 204 V215 M126 204 V215" stroke="INK" stroke-width="4" stroke-linecap="round"/></svg>`;

export default async function Image() {
  const [alfa, mono, s] = await Promise.all([
    readFile(join(process.cwd(), 'assets/AlfaSlabOne-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/JetBrainsMono-Bold.ttf')),
    getCanaryStateSafe({ og: true }),
  ]);

  const dead = s?.status === 'dead';
  const bg = dead ? '#D9D6CE' : '#FFDD1F';
  const ink = dead ? '#1C1B19' : '#17140A';
  const headline = dead ? 'The canary is dead.' : 'This wallet has no private key.';
  const dropping = !dead && !!s?.balanceDropUnresolved;
  const status = !s ? '' : dead ? 'Dead' : dropping ? DROP_LABEL : s.status === 'unfunded' ? 'Not funded yet' : s.aliveSince ? `Alive · day ${dayNumber(s.aliveSince, Date.now())}` : 'Alive';
  const bounty = s?.balanceSol != null ? `${fmtSol(s.balanceSol)} SOL` : '';
  const bird = 'data:image/svg+xml;base64,' + Buffer.from(BIRD.replaceAll('INK', ink).replaceAll('BG', bg)).toString('base64');

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: bg, color: ink, padding: '56px 64px', fontFamily: 'Mono' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Alfa', fontSize: 40 }}>Q-Day Canary</div>
          {status && <div style={{ fontSize: 26, letterSpacing: 2, textTransform: 'uppercase', border: `3px solid ${ink}`, padding: '6px 18px' }}>{status}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
            <div style={{ fontFamily: 'Alfa', fontSize: dropping ? 72 : 86, lineHeight: 1.02 }}>{headline}</div>
            {dropping && (
              <div style={{ background: '#A8201A', color: bg, fontSize: 24, padding: '10px 16px' }}>
                The balance went down. The site is still looking for the transaction.
              </div>
            )}
          </div>
          <img src={bird} width={300} height={191} alt="" style={dead ? { transform: 'rotate(168deg)' } : {}} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: `4px solid ${ink}`, paddingTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
            <div style={{ fontSize: 20, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.7 }}>Bounty</div>
            <div style={{ fontFamily: 'Alfa', fontSize: 48 }}>{bounty || '—'}</div>
          </div>
          <div style={{ fontSize: 24 }}>{CANARY_ADDRESS}</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Alfa', data: alfa, weight: 400, style: 'normal' },
        { name: 'Mono', data: mono, weight: 700, style: 'normal' },
      ],
    },
  );
}
