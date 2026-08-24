import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const profile = mkdtempSync(join(tmpdir(), 'ld-cell-'));
const ctx = await chromium.launchPersistentContext(profile, { headless: false });
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto('https://github.com/anthropics/claude-code/pull/87125/files', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

console.log(await page.evaluate(() => {
  // The row carrying line 1 on the right-hand side.
  const num = [...document.querySelectorAll('td.blob-num[data-line-number="1"]')].pop();
  const row = num?.closest('tr');
  const cell = row?.querySelector('td.blob-code');
  if (!cell) return 'no code cell';
  const cs = getComputedStyle(cell);
  return JSON.stringify({
    cellClass: cell.className,
    cellDisplay: cs.display,
    cellWhiteSpace: cs.whiteSpace,
    cellHTML: cell.innerHTML.slice(0, 300),
    childNodes: [...cell.childNodes].map((n) =>
      n.nodeType === 3
        ? { text: JSON.stringify(n.nodeValue) }
        : { tag: n.tagName, cls: n.className, display: getComputedStyle(n).display }),
  }, null, 2);
}));

await ctx.close();
rmSync(profile, { recursive: true, force: true });
