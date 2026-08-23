/** Dumps the diff markup GitHub actually serves, for both view generations. */
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const profile = mkdtempSync(join(tmpdir(), 'lowdiff-probe-'));
const context = await chromium.launchPersistentContext(profile, { headless: false });
const page = context.pages()[0] ?? (await context.newPage());

for (const path of ['files', 'changes']) {
  const url = `https://github.com/anthropics/claude-code/pull/87125/${path}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    const pick = (sel) => document.querySelectorAll(sel).length;
    const firstRow =
      document.querySelector('tr[data-hunk] , .diff-table tr, [data-testid*="row"], .react-line-number')
        ?.outerHTML?.slice(0, 400) ?? null;
    const fileEl =
      document.querySelector('[data-tagsearch-path], [data-path], [data-testid*="file"]')
        ?.outerHTML?.slice(0, 300) ?? null;
    return {
      url: location.pathname,
      counts: {
        'copy-of-classic .file': pick('.file'),
        '[data-tagsearch-path]': pick('[data-tagsearch-path]'),
        '.diff-table': pick('.diff-table'),
        'td.blob-num': pick('td.blob-num'),
        '[data-testid=diff-view]': pick('[data-testid="diff-view"]'),
        '.react-line-number': pick('.react-line-number'),
        '[data-line-number]': pick('[data-line-number]'),
        'tr': pick('tr'),
      },
      fileEl,
      firstRow,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  console.log('='.repeat(60));
}

await context.close();
rmSync(profile, { recursive: true, force: true });
