/**
 * The options page styles itself with the shared --ld-* tokens. Those are
 * declared under :host for the shadow-rooted overlay — on a plain document
 * they resolve to nothing and every shorthand using them is discarded, which
 * strips the page to unstyled text. Assert the tokens actually resolve here:
 * a bordered input and a visibly filled Save button.
 *
 * Prints a JSON report and exits non-zero if either expectation fails.
 */
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const profile = mkdtempSync(join(tmpdir(), 'lowdiff-options-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

const page = context.pages()[0] ?? (await context.newPage());
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
const extensionId = new URL(worker.url()).host;

await page.goto(`chrome-extension://${extensionId}/options.html`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForSelector('input');

const state = await page.evaluate(() => {
  const input = document.querySelector('input');
  const active = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Anthropic');
  const inputStyle = input ? getComputedStyle(input) : null;
  return {
    inputBorderStyle: inputStyle?.borderTopStyle ?? null,
    inputBorderColor: inputStyle?.borderTopColor ?? null,
    // The selected provider borders in the accent — proof the tokens resolve.
    activeProviderBorder: active ? getComputedStyle(active).borderTopColor : null,
  };
});

// The guided landing: pitch and steps beside the essentials, the optional
// fields folded away, and changes persisting without a Save button.
const landing = await page.evaluate(() => ({
  hasSteps: (document.body.textContent ?? '').includes('Open any pull request'),
  advancedCollapsed: ![...document.querySelectorAll('input')].some(
    (i) => i.placeholder.startsWith('Needed for private repos') && i.checkVisibility(),
  ),
  hasSaveButton: [...document.querySelectorAll('button')].some((b) => b.textContent === 'Save'),
}));

// Typing a key must save on its own and say so.
await page.fill('input[type="password"]', 'sk-test-autosave');
await page.waitForTimeout(1100);
const autosave = await page.evaluate(async () => {
  const stored = await chrome.storage.local.get('lowdiff:settings');
  return {
    persistedKey: stored['lowdiff:settings']?.keys?.anthropic ?? null,
    toastShown: (document.body.textContent ?? '').includes('Saved'),
  };
});

const pass = {
  inputHasBorder: state.inputBorderStyle === 'solid',
  tokensResolve: state.activeProviderBorder === 'rgb(91, 91, 214)',
  guidedLanding: landing.hasSteps && landing.advancedCollapsed && !landing.hasSaveButton,
  autosave: autosave.persistedKey === 'sk-test-autosave' && autosave.toastShown,
};

const shotAt = process.argv.indexOf('--shot');
if (shotAt !== -1) {
  await page.screenshot({ path: process.argv[shotAt + 1], fullPage: true });
  console.log(`screenshot → ${process.argv[shotAt + 1]}`);
}

console.log(JSON.stringify({ ...state, landing, autosave, pass }, null, 2));
if (Object.values(pass).some((p) => !p)) process.exitCode = 1;

await context.close();
rmSync(profile, { recursive: true, force: true });
