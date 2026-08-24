/**
 * Full extension round-trip: load it, configure a key, open a real pull
 * request, and check that badges land on GitHub's own diff rows.
 *
 *   node e2e/review.mjs [pr-url] [--mode explain] [--shot out.png]
 *
 * The key is read from the repo .env and written into a throwaway browser
 * profile that is deleted on exit.
 */
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const ENV = resolve(import.meta.dirname, '..', '..', '..', '.env');

function envValue(name) {
  for (const line of readFileSync(ENV, 'utf8').split('\n')) {
    const m = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`).exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const key = envValue('ANTHROPIC_API_KEY');
if (!key) {
  console.error('No ANTHROPIC_API_KEY in .env');
  process.exit(1);
}

const url =
  process.argv[2] && !process.argv[2].startsWith('--')
    ? process.argv[2]
    : 'https://github.com/anthropics/claude-code/pull/87125/files';
const modeAt = process.argv.indexOf('--mode');
const mode = modeAt === -1 ? 'review' : process.argv[modeAt + 1];
const shotAt = process.argv.indexOf('--shot');
const shot = shotAt === -1 ? null : process.argv[shotAt + 1];

const profile = mkdtempSync(join(tmpdir(), 'lowdiff-review-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

const logs = [];
const page = context.pages()[0] ?? (await context.newPage());
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[error] ${e.message}`));

// Wake the service worker, then write settings through it.
await page.goto('https://github.com', { waitUntil: 'domcontentloaded' });
let worker = context.serviceWorkers()[0];
if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });

await worker.evaluate(
  async ([apiKey, defaultMode]) => {
    await chrome.storage.local.set({
      'lowdiff:settings': {
        provider: 'anthropic',
        keys: { anthropic: apiKey },
        defaultMode,
      },
    });
  },
  [key, mode],
);
console.log(`configured: anthropic, mode=${mode}`);

console.log(`→ ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded' });

// The review is a live API call; give it room.
let badges = 0;
const deadline = Date.now() + 90_000;
while (Date.now() < deadline) {
  badges = await page.evaluate(() => document.querySelectorAll('[data-lowdiff-badge]').length);
  if (badges > 0) break;
  await page.waitForTimeout(1000);
}

const state = await page.evaluate(() => {
  const host = document.getElementById('lowdiff-root');
  const badgeEls = [...document.querySelectorAll('[data-lowdiff-badge]')];
  return {
    mounted: Boolean(host?.shadowRoot),
    badges: badgeEls.length,
    kinds: badgeEls.map((b) => b.getAttribute('data-lowdiff-kind')),
    // Each badge should sit inside the row for its own line.
    rows: badgeEls.map((b) => {
      const row = b.closest('tr');
      const num = row?.querySelector('[data-line-number]')?.getAttribute('data-line-number');
      return { line: num, text: (row?.textContent ?? '').trim().slice(0, 60) };
    }),
    card: (host?.shadowRoot?.querySelector('.root')?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 320),
  };
});

console.log('\n' + JSON.stringify(state, null, 2));
console.log('\n--- logs ---');
for (const l of logs) console.log(l);

if (shot) {
  await page.screenshot({ path: shot });
  console.log(`\nscreenshot → ${shot}`);
}

await context.close();
rmSync(profile, { recursive: true, force: true });
