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
    'lowdiff:settings': { provider: 'anthropic', keys: { anthropic: apiKey } },
    'lowdiff:review:v12:acme/demo#1@fixture': {
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
          kind: 'SUGGESTION',
          title: 'Cache the conda environment between runs',
          body: 'Each run rebuilds the environment from scratch; a cache key on `environment.yml` avoids that.',
          confidence: 'medium',
          anchor: { path: '.github/workflows/python-package-conda.yml', side: 'RIGHT', line: 2, lineHash: 'w' },
        },
        {
          kind: 'RISK',
          title: 'Workflow runs on every push to every branch',
          body: 'An unrestricted `on: [push]` trigger runs this workflow for all branches.',
          confidence: 'medium',
          anchor: { path: '.github/workflows/python-package-conda.yml', side: 'RIGHT', line: 3, lineHash: 'z' },
        },
        {
          kind: 'RISK',
          title: 'Depends on environment.yml that is not in this PR',
          body: 'The `conda env update` step reads `environment.yml`, which this PR does not add.',
          code: 'git add environment.yml',
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
// Scroll the diff into view first, like a real reader — the click must then
// survive whatever scroll events the browser fires around it.
await page.evaluate(() => document.querySelector('table[role="grid"]')?.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(400);

// Line 1 wraps to three visual lines; its badge must not add a fourth.
const wrap = await page.evaluate(() => {
  const cellOf = (n) =>
    [...document.querySelectorAll('[data-line-anchor]')].find(
      (c) => c.getAttribute('data-line-number') === n,
    );
  const wrapped = cellOf('1')?.getBoundingClientRect();
  const single = cellOf('3')?.getBoundingClientRect();
  return wrapped && single ? { lineBoxes: Math.round(wrapped.height / single.height) } : null;
});

const state = await page.evaluate(() => {
  const host = document.getElementById('lowdiff-root');
  const badges = [...document.querySelectorAll('[data-lowdiff-badge]')];
  const card = host?.shadowRoot?.querySelector('.root');
  const cardBg = card?.firstElementChild
    ? getComputedStyle(card.firstElementChild).backgroundColor
    : null;

  badges.find((b) => b.parentElement?.getAttribute('data-line-number') === '4')?.click();
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
    badgeTrailsCode: badges.map(
      (b) => b.parentElement?.hasAttribute('data-line-anchor') && b.parentElement.lastElementChild === b,
    ),
    badgeLines: badges.map((b) => b.parentElement?.getAttribute('data-line-number')),
    cardBackground: cardBg,
    cardText: (card?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
    countChips: [...(card?.querySelectorAll('.pill') ?? [])].map((p) => ({
      tag: p.tagName,
      text: p.textContent?.trim(),
    })),
    hint: (() => {
      const el = [...(card?.querySelectorAll('span, b') ?? [])].find((s) =>
        (s.textContent ?? '').includes('badge'),
      );
      if (!el) return null;
      return { tag: el.tagName, weight: getComputedStyle(el).fontWeight };
    })(),
    summaryChips: card ? card.querySelectorAll('code').length : 0,
    summaryLiteralBackticks: (card?.textContent ?? '').includes('\u0060'),
    highlightedLines: lit.map((r) => r.querySelector('[data-line-number]')?.getAttribute('data-line-number')),
  };
});

await page.waitForTimeout(400);
const popover = await page.evaluate(() => {
  const root = document.getElementById('lowdiff-overlay-root')?.shadowRoot;
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
    contextRow: (root?.textContent ?? '').includes('python-package-conda.yml:4'),
    plainConfidence: (root?.textContent ?? '').includes('depends on code not in this diff'),
    fixLabelled: (root?.textContent ?? '').includes('SUGGESTED FIX'),
    hasGotIt: [...(root?.querySelectorAll('button') ?? [])].some(
      (b) => b.textContent === 'Got it',
    ),
  };
});

// Stars breathe until read: unvisited badges pulse, the open one holds
// still, and a badge stays still after its note is closed — the pulse
// means "you have not looked at this yet".
const pulse = await page.evaluate(async () => {
  const settle = () => new Promise((r) => setTimeout(r, 150));
  const byLine = (n) =>
    [...document.querySelectorAll('[data-lowdiff-badge]')].find(
      (b) => b.parentElement?.getAttribute('data-line-number') === n,
    );
  const anim = (b) => {
    const dot = b?.firstElementChild?.firstElementChild;
    return dot instanceof HTMLElement ? getComputedStyle(dot).animationName : null;
  };
  const whileOpen = { active: anim(byLine('4')), other: anim(byLine('3')) };
  const root = document.getElementById('lowdiff-overlay-root').shadowRoot;
  [...root.querySelectorAll('div,button,span')]
    .find((el) => el.textContent?.trim() === '✕')
    ?.click();
  await settle();
  const afterClose = { visited: anim(byLine('4')), unvisited: anim(byLine('3')) };
  return { whileOpen, afterClose };
});

// Important notes surface themselves: SECURITY and RISK strips sit under
// their rows by default, dismiss per-session, and open the note on click.
const strips = await page.evaluate(async () => {
  const settle = () => new Promise((r) => setTimeout(r, 300));
  const all = () => [...document.querySelectorAll('[data-lowdiff-inline]')];
  const lines = all().map(
    (el) =>
      el.previousElementSibling
        ?.querySelector('[data-line-number]')
        ?.getAttribute('data-line-number') ?? null,
  );
  all()[0]?.querySelector('td span:last-child')?.click();
  await settle();
  const afterDismiss = all().length;
  all()[0]?.querySelector('td')?.click();
  await settle();
  const root = document.getElementById('lowdiff-overlay-root')?.shadowRoot;
  const popoverFromStrip = Boolean(root?.querySelector('[style*="440px"]'));
  [...(root?.querySelectorAll('div,button,span') ?? [])]
    .find((el) => el.textContent?.trim() === '✕')
    ?.click();
  await settle();
  return { lines, afterDismiss, popoverFromStrip };
});

// ‹ › walk the findings in document order.
const navProbe = await page.evaluate(async () => {
  const settle = () => new Promise((r) => setTimeout(r, 250));
  const host = document.getElementById('lowdiff-root');
  const next = [...(host?.shadowRoot?.querySelectorAll('button') ?? [])].find(
    (b) => b.title === 'Next finding',
  );
  const activeLine = () =>
    [...document.querySelectorAll('[data-lowdiff-badge]')]
      .find((b) => {
        const dot = b.firstElementChild?.firstElementChild;
        return dot instanceof HTMLElement && dot.style.transform.includes('scale');
      })
      ?.closest('[data-line-anchor]')
      ?.getAttribute('data-line-number') ?? null;
  next?.click();
  await settle();
  const first = activeLine();
  next?.click();
  await settle();
  const second = activeLine();
  return { hasNav: Boolean(next), first, second };
});

// Chips must share one height and centre line whatever their content —
// emoji and plain-text pills get different line boxes without a fix.
const chipGeometry = await page.evaluate(() => {
  const host = document.getElementById('lowdiff-root');
  const chips = [...(host?.shadowRoot?.querySelectorAll('.pill') ?? [])].map((c) =>
    c.getBoundingClientRect(),
  );
  const title = [...(host?.shadowRoot?.querySelectorAll('span') ?? [])]
    .find((el) => el.textContent === 'AI review of this pull request')
    ?.getBoundingClientRect();
  const centers = chips.map((r) => Math.round((r.top + r.bottom) / 2));
  return {
    heights: chips.map((r) => Math.round(r.height)),
    centerSpread: centers.length ? Math.max(...centers) - Math.min(...centers) : null,
    offCenterFromTitle: title && centers.length
      ? Math.round(Math.max(...centers.map((c) => Math.abs(c - (title.top + title.bottom) / 2))))
      : null,
  };
});

// The chat field wraps: it is a textarea that grows with its content and
// Shift+Enter inserts a line break instead of sending.
const chatField = await page.evaluate(async () => {
  const root = document.getElementById('lowdiff-overlay-root')?.shadowRoot;
  root?.querySelector('[title="Ask AI"]')?.click();
  await new Promise((r) => setTimeout(r, 300));
  const field = root?.querySelector('[placeholder="Ask anything about this PR…"]');
  return { tag: field?.tagName ?? null, initialHeight: field?.clientHeight ?? null };
});
await page.keyboard.type('a long question that should wrap onto another line when it runs out of horizontal room in the panel', { delay: 5 });
const chatFieldAfter = await page.evaluate(async () => {
  const root = document.getElementById('lowdiff-overlay-root')?.shadowRoot;
  const field = root?.querySelector('[placeholder="Ask anything about this PR…"]');
  return { grownHeight: field?.clientHeight ?? null, value: (field?.value ?? '').slice(0, 20) };
});
await page.keyboard.down('Shift');
await page.keyboard.press('Enter');
await page.keyboard.up('Shift');
const chatNewline = await page.evaluate(() => {
  const root = document.getElementById('lowdiff-overlay-root')?.shadowRoot;
  const field = root?.querySelector('[placeholder="Ask anything about this PR…"]');
  const value = field?.value ?? '';
  // Reset for the later chat-keys probe.
  return { endsWithNewline: value.endsWith('\n') };
});
await page.evaluate(() => {
  const root = document.getElementById('lowdiff-overlay-root')?.shadowRoot;
  [...(root?.querySelectorAll('div,button,span') ?? [])]
    .find((el) => el.textContent?.trim() === '✕')
    ?.click();
});
await page.waitForTimeout(300);

// With the target line near the viewport bottom, the popover must flip
// above the highlighted range instead of covering it.
const flip = await page.evaluate(async () => {
  const badge = [...document.querySelectorAll('[data-lowdiff-badge]')].find(
    (b) => b.closest('[data-line-anchor]')?.getAttribute('data-line-number') === '4',
  );
  // The cited lines hug the viewport bottom — exactly where the old clamp
  // slid the popover up on top of them.
  badge?.closest('tr')?.scrollIntoView({ block: 'end' });
  await new Promise((r) => setTimeout(r, 400));
  badge?.click();
  await new Promise((r) => setTimeout(r, 400));
  const pop = document
    .getElementById('lowdiff-overlay-root')
    ?.shadowRoot?.querySelector('[style*="position: fixed"][style*="440px"]')
    ?.getBoundingClientRect();
  const lit = document.querySelector('[data-lowdiff-highlit]')?.getBoundingClientRect();
  if (!pop || !lit) return null;
  return {
    overlapsItsLines: pop.top < lit.bottom && pop.bottom > lit.top,
    popoverAbove: pop.bottom <= lit.top + 1,
    // Above means just above — snug against the lines, not adrift mid-diff.
    snugAboveLine: lit.top - pop.bottom >= 0 && lit.top - pop.bottom <= 20,
  };
});

// Toggle a kind off via settings, as the popup does, and confirm the overlay
// reacts without any reload.
await worker.evaluate(async () => {
  const stored = await chrome.storage.local.get('lowdiff:settings');
  await chrome.storage.local.set({
    'lowdiff:settings': { ...stored['lowdiff:settings'], hiddenKinds: ['RISK'] },
  });
});
await page.waitForTimeout(1600);

const filtered = await page.evaluate(() => {
  const badges = [...document.querySelectorAll('[data-lowdiff-badge]')];
  const host = document.getElementById('lowdiff-root');
  return {
    badgeKindsAfterHide: badges.map((b) => b.getAttribute('data-lowdiff-kind')),
    hiddenNotice: (host?.shadowRoot?.textContent ?? '').includes('hidden by your annotation'),
  };
});

// Keys typed in the chat input must not reach the page. Shadow retargeting
// makes them look to document-level listeners like they come from a plain
// <div>, so GitHub's "ignore form fields" hotkey guard does not apply — a
// "." mid-sentence would launch github.dev and a "/" would steal focus.
await page.evaluate(() => {
  const root = document.getElementById('lowdiff-overlay-root').shadowRoot;
  root.querySelector('[title="Ask AI"]')?.click();
});
await page.waitForTimeout(500);

// Opening the chat is a statement of intent: the next keystrokes belong in
// its input without a second click. Type immediately, focusing nothing.
await page.keyboard.type('hey', { delay: 20 });
const autofocus = await page.evaluate(() => {
  const root = document.getElementById('lowdiff-overlay-root').shadowRoot;
  return {
    valueAfterOpen:
      root.querySelector('[placeholder="Ask anything about this PR…"]')?.value ?? null,
  };
});

// Coming back counts too: blur, click the panel chrome, type — still here.
await page.evaluate(() => {
  const root = document.getElementById('lowdiff-overlay-root').shadowRoot;
  root.querySelector('[placeholder="Ask anything about this PR…"]')?.blur();
  [...root.querySelectorAll('span')].find((el) => el.textContent === 'Chat')?.click();
});
await page.keyboard.type('yo', { delay: 20 });
const refocus = await page.evaluate(() => {
  const root = document.getElementById('lowdiff-overlay-root').shadowRoot;
  return {
    valueAfterReturn:
      root.querySelector('[placeholder="Ask anything about this PR…"]')?.value ?? null,
  };
});

await page.evaluate(() => {
  window.__leaked = [];
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const field =
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      (t instanceof HTMLElement && t.isContentEditable);
    if (!field) window.__leaked.push(e.key);
  });
  const root = document.getElementById('lowdiff-overlay-root').shadowRoot;
  const input = root.querySelector('[placeholder="Ask anything about this PR…"]');
  input?.focus();
  input?.select();
});
await page.keyboard.type('a.t/', { delay: 30 });
const chatKeys = await page.evaluate(() => {
  const root = document.getElementById('lowdiff-overlay-root').shadowRoot;
  const input = root.querySelector('[placeholder="Ask anything about this PR…"]');
  const value = input?.value ?? null;
  // Close the panel so the badge screenshots below stay unobstructed.
  [...root.querySelectorAll('div,button,span')]
    .find((el) => el.textContent?.trim() === '✕')
    ?.click();
  return { leakedToPage: window.__leaked, inputValue: value };
});
await page.waitForTimeout(300);


// Auto-scan off + nothing cached: the card waits for its button.
await worker.evaluate(async () => {
  const stored = await chrome.storage.local.get('lowdiff:settings');
  await chrome.storage.local.set({
    'lowdiff:settings': { ...stored['lowdiff:settings'], autoScan: false, hiddenKinds: [] },
  });
  await chrome.storage.local.remove('lowdiff:review:v12:acme/demo#1@fixture');
});
await open(URL);
await page.waitForTimeout(1800);
const optIn = await page.evaluate(() => {
  const root = document.getElementById('lowdiff-root')?.shadowRoot;
  return {
    scanButton: [...(root?.querySelectorAll('button') ?? [])].some((b) =>
      b.textContent?.includes('Review this pull request'),
    ),
    reading: (root?.textContent ?? '').includes('Reading the diff'),
  };
});

console.log(
  JSON.stringify({ ...state, wrap, popover, flip, pulse, strips, navProbe, optIn, chipGeometry, chatField, chatFieldAfter, chatNewline, filtered, autofocus, refocus, chatKeys }, null, 2),
);
console.log('\n--- logs ---');
for (const l of logs) console.log(l);

{
  // Close-up of one badge and its surroundings, for eyeballing the glow.
  // After the opt-in reload above there are no badges; skip in that case.
  const badge = page.locator('[data-lowdiff-badge]').first();
  const box = (await page.locator('[data-lowdiff-badge]').count()) > 0
    ? await badge.boundingBox()
    : null;
  if (box) {
    await page.screenshot({
      path: '/tmp/lowdiff-badge-closeup.png',
      clip: { x: Math.max(0, box.x - 60), y: Math.max(0, box.y - 25), width: 260, height: 80 },
    });
    console.log('closeup → /tmp/lowdiff-badge-closeup.png');
  }
}

if (shot) {
  await page.screenshot({ path: shot });
  console.log(`\nscreenshot → ${shot}`);
}

await context.close();
rmSync(profile, { recursive: true, force: true });
