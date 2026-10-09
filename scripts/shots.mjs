// Retakes the README screenshots from a locally running site.
//
//   1. Start the site without the team wallet, e.g.
//        TEAM_WALLET= npm run build && TEAM_WALLET= npm start
//   2. npm run shots            (or SHOTS_URL=http://localhost:3001 npm run shots)
//
// Uses the installed Google Chrome through playwright-core; no browser is downloaded.
// Every frame is an element crop, never the whole page. The Token section, the ticker, the contract
// address and the team wallet must never be in a frame; the crops below stay inside the hero and the
// "Build the wallet yourself" section, which hold none of them.

import { chromium } from 'playwright-core';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const URL = process.env.SHOTS_URL || 'http://localhost:3000';
const OUT = join(process.cwd(), 'docs');
const MAX_BYTES = 400 * 1024;
const PAD = 24;
const OWN_SENTENCE = 'My own canary. Solana mainnet.';

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2, colorScheme: 'light' });
const page = await context.newPage();
await mkdir(OUT, { recursive: true });

async function open() {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
}

/** Document coordinates of an element. */
const box = (locator) => locator.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, bottom: r.bottom + scrollY };
});

/** `stopAt`: document y of the next element; the frame ends a few pixels above it. */
async function shoot(name, rect, stopAt = Infinity) {
  const bottom = Math.min(rect.y + rect.height + PAD, stopAt - 4);
  const clip = { x: Math.max(0, rect.x - PAD), y: Math.max(0, rect.y - PAD), width: rect.width + PAD * 2 };
  clip.height = bottom - clip.y;
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, clip, fullPage: true });
  const { size } = await stat(file);
  console.log(`${name}.png  ${Math.round(clip.width * 2)}x${Math.round(clip.height * 2)}  ${Math.round(size / 1024)} KB`);
  if (size > MAX_BYTES) throw new Error(`${name}.png is over 400 KB`);
}

const forbidden = async (rect) => {
  // The Token section must lie entirely outside every frame.
  const token = page.locator('section', { has: page.locator('h2', { hasText: /^Token/ }) });
  if (await token.count()) {
    const t = await box(token);
    if (t.y < rect.y + rect.height + PAD && t.bottom > rect.y - PAD) throw new Error('Token section would be in the frame');
  }
};

// Live status: heading, address and the status line of the hero.
await open();
const hero = page.locator('section.hero');
const heroBox = await box(hero);
const feesValue = (await page.locator('.stats div', { hasText: 'Fees waiting' }).locator('dd').first().textContent())?.trim();
let statusRect = heroBox;
let statusStop = Infinity;
if (feesValue === '—') {
  // No TEAM_WALLET in the environment: Fees waiting shows a dash, so stop under the first stats row,
  // before the labels of the second row.
  const cells = page.locator('.stats > div');
  const firstRow = await box(cells.first());
  statusRect = { ...heroBox, height: firstRow.bottom - heroBox.y };
  statusStop = (await box(cells.nth(3))).y;
}
await forbidden(statusRect);
await shoot('shot-status', statusRect, statusStop);

// Build the wallet yourself, after the animation, with the match line.
const derive = page.locator('section', { has: page.locator('h2', { hasText: 'Build the wallet yourself' }) });
await page.getByText('Matches the canary address above').waitFor({ timeout: 30_000 });
const deriveRect = await box(derive);
await forbidden(deriveRect);
await shoot('shot-derive', deriveRect);

// Your canary: a sentence of our own, after its animation.
await page.getByLabel('Public sentence').fill(OWN_SENTENCE);
await page.getByRole('button', { name: 'Derive' }).click();
await page.locator('.yours').waitFor({ timeout: 30_000 });
await page.getByText('This is a different wallet from the canary').waitFor({ timeout: 30_000 });
const ownRect = await box(page.locator('.yours'));
await forbidden(ownRect);
await shoot('shot-own', ownRect, (await box(page.locator('.checks'))).y);

// Simulation of Q-Day: the hero after the button, with its simulation label.
await open();
await page.getByRole('button', { name: 'Simulate Q-Day' }).click();
await page.getByText(/simulation · real numbers are unchanged/i).waitFor();
await page.waitForTimeout(1200); // bird and background transitions
const simRect = await box(page.locator('section.hero'));
await forbidden(simRect);
await shoot('shot-simulate', simRect);

await browser.close();
