/**
 * Loads the built extension into a real Chromium and reports what the overlay
 * actually did on a live pull request.
 *
 *   node e2e/overlay.mjs [pr-url] [--headed] [--shot out.png]
 *
 * MV3 extensions need a persistent context; they cannot be loaded into an
 * ordinary browser launch.
 */
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const url =
  process.argv[2] && !process.argv[2].startsWith('--')
    ? process.argv[2]
    : 'https://github.com/anthropics/claude-code/pull/87125/files';
const headed = process.argv.includes('--headed');
const shotAt = process.argv.indexOf('--shot');
const shot = shotAt === -1 ? null : process.argv[shotAt + 1];

const profile = mkdtempSync(join(tmpdir(), 'lowdiff-e2e-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: !headed,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

const logs = [];
// The service worker logs separately from the page.
context.on('serviceworker', (worker) => {
  logs.push(`[worker] started ${worker.url()}`);
});

const page = context.pages()[0] ?? (await context.newPage());
page.on('console', (msg) => logs.push(`[page:${msg.type()}] ${msg.text()}`));
page.on('pageerror', (e) => logs.push(`[page:error] ${e.message}`));

console.log(`→ ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded' });

let mounted = false;
try {
  await page.waitForSelector('#lowdiff-root', { timeout: 20000 });
  mounted = true;
} catch {
  mounted = false;
}

// Read through the shadow boundary.
await page.waitForTimeout(8000); // let the review round-trip finish

const state = await page.evaluate(() => {
  const host = document.getElementById('lowdiff-root');
  const badges = document.querySelectorAll('[data-lowdiff-badge]');
  if (!host?.shadowRoot) return { host: false, badgesInPage: badges.length };
  const card = host.shadowRoot.querySelector('.root');
  return {
    host: true,
    // Badges are injected into GitHub's own rows, not our shadow root.
    badgesInPage: badges.length,
    badgeKinds: [...badges].map((b) => b.getAttribute('data-lowdiff-kind')),
    cardText: (card?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
  };
});

console.log('\nmounted:', mounted);
console.log('state:', JSON.stringify(state, null, 2));
console.log('\n--- logs ---');
for (const line of logs) console.log(line);

if (shot) {
  await page.screenshot({ path: shot, fullPage: false });
  console.log(`\nscreenshot → ${shot}`);
}

await context.close();
rmSync(profile, { recursive: true, force: true });
