/**
 * The two ways "refresh the page to get a scan" happens, both driven the way
 * GitHub's client-rendered UI actually navigates: history.pushState, no
 * document load.
 *
 *   A. Arrive at a PR from a non-PR page. Content scripts inject only at
 *      document load, so the manifest match must cover the page the user
 *      landed on, not just PR URLs.
 *   B. The extension reloads (every dev rebuild) while a tab is open. The
 *      orphaned content script's chrome.* calls throw; the overlay must say
 *      "refresh" instead of spinning forever.
 *
 * Prints a JSON report and exits non-zero if either expectation fails.
 */
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const PAGE = readFileSync(resolve(import.meta.dirname, 'pages/changes-dark.html'), 'utf8');
const LIST_URL = 'https://github.com/acme/demo/pulls';
const PR_URL = 'https://github.com/acme/demo/pull/1/changes';

const profile = mkdtempSync(join(tmpdir(), 'lowdiff-spa-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  colorScheme: 'dark',
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

const logs = [];
const page = context.pages()[0] ?? (await context.newPage());
page.on('console', (m) => logs.push(m.text()));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

// The PR list page must not match the content-script pattern; the PR page is
// the same fixture modern-dark.mjs uses.
await context.route('https://github.com/**', (route) => {
  const isList = route.request().url().includes('/pulls');
  route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: isList ? '<!doctype html><html><body><h1>Pull requests</h1></body></html>' : PAGE,
  });
});

/** Swap in the PR fixture body and change the URL, as GitHub's router would. */
async function softNavigate(url) {
  await page.evaluate(
    ([href, html]) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      document.body.innerHTML = doc.body.innerHTML;
      history.pushState({}, '', href);
    },
    [url, PAGE],
  );
}

// --- A: land on the PR list, then soft-navigate into the PR. -----------------
await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await softNavigate(PR_URL);
await page.waitForTimeout(2500);

const a = {
  injected: logs.some((l) => l.includes('[LowDiff] build')),
  mounted: await page.evaluate(() => Boolean(document.getElementById('lowdiff-root'))),
};
a.pass = a.injected && a.mounted;

// --- B: reload the extension under an open tab, then navigate again. ---------
await page.goto(PR_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
await worker.evaluate(() => chrome.runtime.reload()).catch(() => {});
await page.waitForTimeout(1000);

await softNavigate('https://github.com/acme/demo/pull/2/changes');
// Past the overlay's stalled-round-trip deadline, so the hint has appeared.
await page.waitForTimeout(4000);

const b = await page.evaluate(() => {
  const card = document.getElementById('lowdiff-root')?.shadowRoot?.querySelector('.root');
  const text = (card?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return {
    remounted: text.length > 0,
    saysRefresh: text.includes('Refresh the page'),
    cardText: text.slice(0, 160),
  };
});
b.pass = b.remounted && b.saysRefresh;

console.log(JSON.stringify({ a, b, logs: logs.slice(-12) }, null, 2));
if (!a.pass || !b.pass) process.exitCode = 1;

await context.close();
rmSync(profile, { recursive: true, force: true });
