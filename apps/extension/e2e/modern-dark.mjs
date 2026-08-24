/**
 * Exercises the client-rendered (/changes) adapter and the dark palette.
 *
 * Neither can be reached from a test browser: that view is rolled out per
 * account and redirects to the classic one when logged out. The request for
 * the PR page is fulfilled from a local fixture instead, so the extension runs
 * against github.com for real — matching its content-script pattern — while
 * seeing the markup and Primer variables of the newer dark view.
 */
import { chromium } from 'playwright';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, '..', 'dist');
const PAGE = readFileSync(resolve(import.meta.dirname, 'pages/changes-dark.html'), 'utf8');
const ENV = resolve(import.meta.dirname, '..', '..', '..', '.env');
const URL = 'https://github.com/acme/demo/pull/1/changes';

function envValue(name) {
  for (const line of readFileSync(ENV, 'utf8').split('\n')) {
    const m = new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`).exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

const shotAt = process.argv.indexOf('--shot');
const shot = shotAt === -1 ? null : process.argv[shotAt + 1];

const profile = mkdtempSync(join(tmpdir(), 'lowdiff-modern-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  colorScheme: 'dark',
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

const logs = [];
const page = context.pages()[0] ?? (await context.newPage());
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[error] ${e.message}`));

// Serve the fixture for the PR page.
await context.route('https://github.com/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: PAGE }),
);

// The repository in the fixture does not exist, so the API is stubbed to
// return a PR whose head SHA matches the cached review seeded below.
await context.route('https://api.github.com/repos/acme/demo/pulls/1', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      title: 'Create python-package-conda.yml',
      body: '',
      head: { sha: 'fixture' },
    }),
  }),
);
await context.route('https://api.github.com/repos/acme/demo/pulls/1/files*', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([
      {
        filename: '.github/workflows/python-package-conda.yml',
        status: 'added',
        additions: 4,
        deletions: 0,
        patch: '@@ -0,0 +1,4 @@\n+10000000$usdc\n+name: Python Package using Conda\n+on: [push]\n+    run: conda env update --file environment.yml',
      },
    ]),
  }),
);

let worker = context.serviceWorkers()[0];
if (!worker) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

// Stub the review so this test measures rendering, not the model. The live
// review path is covered by e2e/review.mjs.
await worker.evaluate(async (apiKey) => {
  await chrome.storage.local.set({
    'lowdiff:settings': { provider: 'anthropic', keys: { anthropic: apiKey }, defaultMode: 'review' },
    'lowdiff:review:v3:acme/demo#1@fixture:review': {
      summary: 'The file is prefixed with a crypto wallet address inside `python-package-conda.yml`, making the YAML invalid.',
      headSha: 'fixture',
      usage: { inputTokens: 0, outputTokens: 0 },
      storedAt: Date.now(),
      notes: [
        {
          kind: 'SECURITY',
          title: 'Crypto wallet address injected into a workflow',
          body: 'Line 1 is a payment amount, not YAML. Treat the PR as untrusted.\n\n```yaml\nname: Python Package using Conda\non: [push]\n```',
          confidence: 'high',
          anchor: { path: '.github/workflows/python-package-conda.yml', side: 'RIGHT', line: 1, endLine: 2, lineHash: 'x' },
        },
        {
          kind: 'RISK',
          title: 'Depends on environment.yml that is not in this PR',
          body: 'The `conda env update` step reads `environment.yml`, which this PR does not add.',
          confidence: 'medium',
          anchor: { path: '.github/workflows/python-package-conda.yml', side: 'RIGHT', line: 4, lineHash: 'y' },
        },
      ],
    },
  });
}, envValue('ANTHROPIC_API_KEY'));

// On first install the worker opens its options page, which can interrupt a
// navigation already in flight. Retry rather than fail the run.
async function open(target) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      if (attempt === 3 || !String(error).includes('interrupted')) throw error;
      await page.waitForTimeout(500);
    }
  }
}

await open(URL);
await page.waitForTimeout(2500);

const state = await page.evaluate(() => {
  const host = document.getElementById('lowdiff-root');
  const badges = [...document.querySelectorAll('[data-lowdiff-badge]')];
  const card = host?.shadowRoot?.querySelector('.root');
  const cardBg = card?.firstElementChild
    ? getComputedStyle(card.firstElementChild).backgroundColor
    : null;

  badges[1]?.click();
  const lit = [...document.querySelectorAll('[data-lowdiff-highlit]')];

  // The card must sit above the first file and inside the diff column, not
  // above the PR header.
  const firstFile = document.querySelector('[role="region"][id^="diff-"]');
  const title = document.querySelector('h1');
  const hostRect = host?.getBoundingClientRect();

  return {
    mounted: Boolean(host?.shadowRoot),
    cardAboveFirstFile: Boolean(hostRect && firstFile && hostRect.top < firstFile.getBoundingClientRect().top),
    cardBelowPrTitle: Boolean(hostRect && title && hostRect.top > title.getBoundingClientRect().top),
    cardWidth: hostRect ? Math.round(hostRect.width) : null,
    summaryTextWidth: (() => {
      const body = host?.shadowRoot?.querySelector('.root p');
      return body ? Math.round(body.getBoundingClientRect().width) : null;
    })(),
    columnWidth: firstFile ? Math.round(firstFile.getBoundingClientRect().width) : null,
    badges: badges.length,
    badgeParentIsGutter: badges.map((b) => !b.parentElement?.hasAttribute('data-line-anchor')),
    badgeLines: badges.map((b) => b.parentElement?.getAttribute('data-line-number')),
    cardBackground: cardBg,
    summaryChips: card ? card.querySelectorAll('code').length : 0,
    summaryLiteralBackticks: (card?.textContent ?? '').includes('\u0060'),
    highlightedLines: lit.map((r) => r.querySelector('[data-line-number]')?.getAttribute('data-line-number')),
  };
});

await page.waitForTimeout(400);
const popover = await page.evaluate(() => {
  const root = document.getElementById('lowdiff-root')?.shadowRoot;
  const pre = root?.querySelector('pre');
  const label = [...(root?.querySelectorAll('span') ?? [])].find((s) => s.textContent === 'yaml');
  const chips = [...(root?.querySelectorAll('code') ?? [])];
  return {
    open: Boolean(root?.querySelector('[style*="440px"]')),
    codeBlockRendered: Boolean(pre),
    languageLabel: Boolean(label),
    literalFences: (root?.textContent ?? '').includes('```'),
    inlineCodeChips: chips.length,
    chipText: chips.map((c) => c.textContent),
    // A backtick still in the rendered text means the span was not parsed.
    literalBackticks: (root?.textContent ?? '').includes('`'),
  };
});

console.log(JSON.stringify({ ...state, popover }, null, 2));
console.log('\n--- logs ---');
for (const l of logs) console.log(l);

if (shot) {
  await page.screenshot({ path: shot });
  console.log(`\nscreenshot → ${shot}`);
}

await context.close();
rmSync(profile, { recursive: true, force: true });
