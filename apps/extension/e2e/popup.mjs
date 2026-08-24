/** Opens the real popup page inside the loaded extension and screenshots it. */
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const dark = process.argv.includes('--dark');
const shot = process.argv[process.argv.indexOf('--shot') + 1];

const profile = mkdtempSync(join(tmpdir(), 'lowdiff-popup-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  colorScheme: dark ? 'dark' : 'light',
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto('https://example.com', { waitUntil: 'domcontentloaded' }).catch(() => {});
let worker = context.serviceWorkers()[0];
if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });

// Seed settings so the popup shows a configured state.
await worker.evaluate(async () => {
  await chrome.storage.local.set({
    'lowdiff:settings': {
      provider: 'anthropic',
      keys: { anthropic: 'sk-test' },
      defaultMode: 'review',
    },
  });
});

const id = new URL(worker.url()).host;
await page.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'domcontentloaded' });
await page.setViewportSize({ width: 320, height: 560 });
await page.waitForTimeout(400);

// Hide two kinds, switch provider, pick a model; read back what persisted.
await page.click('button:has-text("Problems only")');
await page.click('button:has-text("Google")');
await page.waitForTimeout(200);
await page.selectOption('select', 'gemini-3.7-pro');
await page.waitForTimeout(200);

const persisted = await worker.evaluate(async () => {
  const stored = await chrome.storage.local.get('lowdiff:settings');
  const s = stored['lowdiff:settings'];
  return { provider: s.provider, model: s.model, mode: s.defaultMode, hidden: s.hiddenKinds };
});
console.log('persisted after clicks:', JSON.stringify(persisted));

if (shot) {
  await page.screenshot({ path: shot });
  console.log('screenshot →', shot);
}
await context.close();
rmSync(profile, { recursive: true, force: true });
