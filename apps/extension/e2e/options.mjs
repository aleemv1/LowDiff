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
  const save = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Save');
  const inputStyle = input ? getComputedStyle(input) : null;
  const saveStyle = save ? getComputedStyle(save) : null;
  return {
    inputBorderStyle: inputStyle?.borderTopStyle ?? null,
    inputBorderColor: inputStyle?.borderTopColor ?? null,
    saveBackground: saveStyle?.backgroundColor ?? null,
    saveTextColor: saveStyle?.color ?? null,
  };
});

const pass = {
  inputHasBorder: state.inputBorderStyle === 'solid',
  saveIsVisible:
    Boolean(state.saveBackground) &&
    state.saveBackground !== 'rgba(0, 0, 0, 0)' &&
    state.saveBackground !== state.saveTextColor,
};

const shotAt = process.argv.indexOf('--shot');
if (shotAt !== -1) {
  await page.screenshot({ path: process.argv[shotAt + 1], fullPage: true });
  console.log(`screenshot → ${process.argv[shotAt + 1]}`);
}

console.log(JSON.stringify({ ...state, pass }, null, 2));
if (!pass.inputHasBorder || !pass.saveIsVisible) process.exitCode = 1;

await context.close();
rmSync(profile, { recursive: true, force: true });
