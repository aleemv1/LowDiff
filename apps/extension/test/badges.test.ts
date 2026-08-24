/**
 * @vitest-environment happy-dom
 *
 * Runs the DOM adapter and badge injector against real GitHub diff markup.
 * This is the most breakage-prone part of the extension — GitHub reships the
 * diff view regularly — so it is pinned to a saved copy of their output.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Note } from '@lowdiff/core';
import { classicDom } from '../src/content/dom/classic.js';
import { modernDom } from '../src/content/dom/modern.js';
import { detectDiffDom } from '../src/content/dom/index.js';
import { clearBadges, syncBadges } from '../src/content/annotate.js';

const FIXTURE = readFileSync(
  resolve(import.meta.dirname, 'fixtures/pr-files-classic.html'),
  'utf8',
);

const PATH = '.github/workflows/python-package-conda.yml';

function note(over: Partial<Note> = {}): Note {
  return {
    kind: 'SECURITY',
    title: 'Wallet address planted in a workflow file',
    body: 'The first lines of this workflow are not YAML — they look like a crypto address dropped into the file.',
    confidence: 'high',
    anchor: { path: PATH, side: 'RIGHT', line: 3, lineHash: 'x' },
    ...over,
  } as Note;
}

beforeEach(() => {
  document.documentElement.innerHTML = FIXTURE;
  clearBadges();
});

describe('classicDom', () => {
  it('recognises GitHub server-rendered markup', () => {
    expect(classicDom.matches()).toBe(true);
  });

  it('is the adapter chosen for this page', () => {
    expect(detectDiffDom()?.name).toBe('classic');
  });

  it('finds the changed file by path', () => {
    expect(classicDom.paths()).toContain(PATH);
  });

  it('reads every rendered line', () => {
    expect(classicDom.lines(PATH).length).toBeGreaterThan(30);
  });

  it('maps a right-side line number to a row with code', () => {
    const line = classicDom.lines(PATH).find((l) => l.side === 'RIGHT' && l.line === 5);
    expect(line).toBeDefined();
    expect(line!.codeCell.textContent).toContain('Python Package using Conda');
  });

  it('returns nothing for a file not in the diff', () => {
    expect(classicDom.lines('src/nope.ts')).toEqual([]);
  });
});

describe('syncBadges', () => {
  it('places a badge on the anchored line', () => {
    const placed = syncBadges([note()], classicDom, () => {});
    expect(placed).toBe(1);
    expect(document.querySelectorAll('[data-lowdiff-badge]')).toHaveLength(1);
  });

  it('puts the badge inside the row for that line', () => {
    syncBadges([note({ anchor: { path: PATH, side: 'RIGHT', line: 5, lineHash: 'x' } })], classicDom, () => {});
    const badge = document.querySelector('[data-lowdiff-badge]')!;
    const row = badge.closest('tr')!;
    expect(row.textContent).toContain('Python Package using Conda');
  });

  it('reports notes it could not place', () => {
    const placed = syncBadges([note({ anchor: { path: PATH, side: 'RIGHT', line: 9999, lineHash: 'x' } })], classicDom, () => {});
    expect(placed).toBe(0);
  });

  it('skips notes for files not on the page', () => {
    const placed = syncBadges([note({ anchor: { path: 'other.ts', side: 'RIGHT', line: 1, lineHash: 'x' } })], classicDom, () => {});
    expect(placed).toBe(0);
  });

  it('fires the callback with the note when clicked', () => {
    const seen: string[] = [];
    syncBadges([note()], classicDom, ({ note: n }) => seen.push(n.title));
    (document.querySelector('[data-lowdiff-badge]') as HTMLElement).click();
    expect(seen).toEqual(['Wallet address planted in a workflow file']);
  });

  it('replaces badges rather than accumulating them on re-run', () => {
    syncBadges([note()], classicDom, () => {});
    syncBadges([note()], classicDom, () => {});
    expect(document.querySelectorAll('[data-lowdiff-badge]')).toHaveLength(1);
  });

  it('carries the note kind for styling', () => {
    syncBadges([note({ kind: 'BREAKING' })], classicDom, () => {});
    expect(
      document.querySelector('[data-lowdiff-badge]')!.getAttribute('data-lowdiff-kind'),
    ).toBe('BREAKING');
  });

  it('clearBadges removes them all', () => {
    syncBadges([note(), note({ anchor: { path: PATH, side: 'RIGHT', line: 5, lineHash: 'x' } })], classicDom, () => {});
    clearBadges();
    expect(document.querySelectorAll('[data-lowdiff-badge]')).toHaveLength(0);
  });
});

/**
 * The `/changes` view is rolled out per account and redirects to the classic
 * view when logged out, so it cannot be captured by fetching a page. This
 * fixture reproduces the attributes observed on a live one.
 */
describe('modernDom', () => {
  const MODERN = readFileSync(
    resolve(import.meta.dirname, 'fixtures/pr-changes-modern.html'),
    'utf8',
  );

  beforeEach(() => {
    document.documentElement.innerHTML = MODERN;
    clearBadges();
  });

  it('recognises the client-rendered view', () => {
    expect(modernDom.matches()).toBe(true);
  });

  it('wins over the classic adapter when both could apply', () => {
    expect(detectDiffDom()?.name).toBe('modern');
  });

  it('reads the path out of the grid label', () => {
    expect(modernDom.paths()).toEqual([PATH]);
  });

  it('returns one entry per line, not one per cell', () => {
    // Each line has a gutter cell and a code cell; only the code cell counts.
    expect(modernDom.lines(PATH)).toHaveLength(3);
  });

  it('anchors to the code cell, not the line-number gutter', () => {
    const line = modernDom.lines(PATH).find((l) => l.line === 2)!;
    expect(line.codeCell.textContent).toContain('Python Package using Conda');
  });

  it('normalises lowercase sides to the casing note anchors use', () => {
    const sides = modernDom.lines(PATH).map((l) => l.side);
    expect(sides).toEqual(['RIGHT', 'RIGHT', 'LEFT']);
  });

  it('places a badge on the right-side line', () => {
    const placed = syncBadges(
      [note({ anchor: { path: PATH, side: 'RIGHT', line: 2, lineHash: 'x' } })],
      modernDom,
      () => {},
    );
    expect(placed).toBe(1);
    const badge = document.querySelector('[data-lowdiff-badge]')!;
    expect(badge.closest('tr')!.textContent).toContain('Python Package using Conda');
  });

  it('places a badge on a deleted line', () => {
    const placed = syncBadges(
      [note({ anchor: { path: PATH, side: 'LEFT', line: 9, lineHash: 'x' } })],
      modernDom,
      () => {},
    );
    expect(placed).toBe(1);
  });

  it('does not place a right-side note on a left-only line', () => {
    const placed = syncBadges(
      [note({ anchor: { path: PATH, side: 'RIGHT', line: 9, lineHash: 'x' } })],
      modernDom,
      () => {},
    );
    expect(placed).toBe(0);
  });
});

/**
 * GitHub styles `.blob-code-inner` as display:table-cell. A badge placed after
 * it becomes a sibling table cell and renders on its own line, so it has to go
 * inside that span.
 */
describe('badge insertion point', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = `
      <div class="js-diff-progressive-container">
        <div class="file" data-tagsearch-path="a.ts">
          <table class="diff-table"><tbody>
            <tr>
              <td class="blob-num" data-line-number="1"></td>
              <td class="blob-num" data-line-number="1"></td>
              <td class="blob-code">
                <span class="blob-code-inner"><span class="pl-s">+const a = 1;</span></span>
              </td>
            </tr>
          </tbody></table>
        </div>
      </div>`;
    clearBadges();
  });

  it('targets the inner code span, not the cell', () => {
    expect(classicDom.lines('a.ts')[0]!.codeCell.className).toContain('blob-code-inner');
  });

  it('puts the badge inside that span', () => {
    syncBadges(
      [note({ anchor: { path: 'a.ts', side: 'RIGHT', line: 1, lineHash: 'x' } })],
      classicDom,
      () => {},
    );
    const badge = document.querySelector('[data-lowdiff-badge]')!;
    expect(badge.parentElement!.className).toContain('blob-code-inner');
  });

  it('falls back to the cell when there is no inner span', () => {
    document.querySelector('.blob-code-inner')!.replaceWith('+const a = 1;');
    expect(classicDom.lines('a.ts')[0]!.codeCell.className).toContain('blob-code');
  });
});
