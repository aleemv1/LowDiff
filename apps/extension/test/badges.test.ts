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
import { clearBadges, syncBadges, syncInlineNotes } from '../src/content/annotate.js';

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

  it('gives same-titled notes on different lines distinct nav keys', () => {
    // ‹ › nav tracks the cursor by badge identity; two lint-style findings
    // sharing a kind and title must not collapse into one cursor position.
    syncBadges(
      [note(), note({ anchor: { path: PATH, side: 'RIGHT', line: 5, lineHash: 'x' } })],
      classicDom,
      () => {},
    );
    const keys = [...document.querySelectorAll('[data-lowdiff-badge]')].map((b) =>
      b.getAttribute('data-lowdiff-key'),
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).not.toBe(keys[1]);
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

  it('resolves the gutter cell separately from the code cell', () => {
    const line = modernDom.lines(PATH).find((l) => l.line === 2)!;
    expect(line.gutterCell.hasAttribute('data-line-anchor')).toBe(false);
    expect(line.codeCell.hasAttribute('data-line-anchor')).toBe(true);
  });

  it('puts the badge at the end of the code line', () => {
    syncBadges(
      [note({ anchor: { path: PATH, side: 'RIGHT', line: 2, lineHash: 'x' } })],
      modernDom,
      () => {},
    );
    const badge = document.querySelector('[data-lowdiff-badge]')!;
    expect(badge.parentElement!.hasAttribute('data-line-anchor')).toBe(true);
    expect(badge.parentElement!.lastElementChild).toBe(badge);
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

  it('a deleted-line badge trails its code like any other', () => {
    syncBadges(
      [note({ anchor: { path: PATH, side: 'LEFT', line: 9, lineHash: 'x' } })],
      modernDom,
      () => {},
    );
    const badge = document.querySelector('[data-lowdiff-badge]')!;
    expect(badge.parentElement!.hasAttribute('data-line-anchor')).toBe(true);
    expect(badge.parentElement!.textContent).toContain('old removed line');
  });
});

/**
 * Badges live in the line-number gutter, not the code. Injecting into the code
 * cell broke differently in each generation of GitHub's markup — a sibling
 * table cell in the classic view, a forced line break in the newer one.
 */
describe('syncInlineNotes', () => {
  const MODERN = readFileSync(
    resolve(import.meta.dirname, 'fixtures/pr-changes-modern.html'),
    'utf8',
  );

  beforeEach(() => {
    document.documentElement.innerHTML = MODERN;
    clearBadges();
  });

  it('shows SECURITY as a strip under its row by default', () => {
    syncInlineNotes(
      [note({ kind: 'SECURITY', anchor: { path: PATH, side: 'RIGHT', line: 2, lineHash: 'x' } })],
      modernDom,
      () => {},
    );
    const strip = document.querySelector('[data-lowdiff-inline]')!;
    expect(strip).not.toBeNull();
    expect(strip.textContent).toContain('Wallet address planted in a workflow file');
    expect(strip.previousElementSibling?.textContent).toContain('Python Package using Conda');
  });

  it('keeps quieter kinds behind their star', () => {
    syncInlineNotes(
      [note({ kind: 'SUGGESTION', anchor: { path: PATH, side: 'RIGHT', line: 2, lineHash: 'x' } })],
      modernDom,
      () => {},
    );
    expect(document.querySelector('[data-lowdiff-inline]')).toBeNull();
  });

  it('a dismissed strip stays dismissed across re-syncs', () => {
    const target = [
      note({
        kind: 'SECURITY',
        title: 'Dismiss me',
        anchor: { path: PATH, side: 'RIGHT', line: 2, lineHash: 'x' },
      }),
    ];
    syncInlineNotes(target, modernDom, () => {});
    (document.querySelector('[data-lowdiff-inline] span:last-child') as HTMLElement).click();
    expect(document.querySelector('[data-lowdiff-inline]')).toBeNull();
    syncInlineNotes(target, modernDom, () => {});
    expect(document.querySelector('[data-lowdiff-inline]')).toBeNull();
  });

  it('clicking the strip opens the note', () => {
    const seen: string[] = [];
    syncInlineNotes(
      [note({ kind: 'SECURITY', anchor: { path: PATH, side: 'RIGHT', line: 2, lineHash: 'x' } })],
      modernDom,
      ({ note: n }) => seen.push(n.kind),
    );
    (document.querySelector('[data-lowdiff-inline] td') as HTMLElement).click();
    expect(seen).toEqual(['SECURITY']);
  });
});

describe('badge placement in the gutter', () => {
  it('classic: the gutter cell is the line-number cell', () => {
    document.documentElement.innerHTML = FIXTURE;
    const line = classicDom.lines(PATH).find((l) => l.side === 'RIGHT' && l.line === 5)!;
    expect(line.gutterCell.className).toContain('blob-num');
    expect(line.gutterCell.getAttribute('data-line-number')).toBe('5');
  });

  it('classic: the badge trails the code text', () => {
    document.documentElement.innerHTML = FIXTURE;
    clearBadges();
    syncBadges(
      [note({ anchor: { path: PATH, side: 'RIGHT', line: 5, lineHash: 'x' } })],
      classicDom,
      () => {},
    );
    const badge = document.querySelector('[data-lowdiff-badge]')!;
    // Inside the code cell — possibly within the final syntax span, which is
    // where the last visible character lives.
    expect(badge.closest('.blob-code')).not.toBeNull();
  });

  it('classic: the code text is left untouched', () => {
    document.documentElement.innerHTML = FIXTURE;
    clearBadges();
    const before = classicDom.lines(PATH).find((l) => l.line === 5)!.codeCell.textContent;
    syncBadges(
      [note({ anchor: { path: PATH, side: 'RIGHT', line: 5, lineHash: 'x' } })],
      classicDom,
      () => {},
    );
    const after = classicDom.lines(PATH).find((l) => l.line === 5)!.codeCell.textContent;
    expect(after).toBe(before);
  });

  it('classic: a deleted-line badge trails its code too', () => {
    document.documentElement.innerHTML = `
      <div class="file" data-tagsearch-path="src/removed.ts">
        <table><tbody>
          <tr>
            <td class="blob-num blob-num-deletion" data-line-number="7"></td>
            <td class="blob-num blob-num-deletion"></td>
            <td class="blob-code blob-code-deletion"><span class="blob-code-inner">-gone()</span></td>
          </tr>
        </tbody></table>
      </div>`;
    clearBadges();
    const placed = syncBadges(
      [note({ anchor: { path: 'src/removed.ts', side: 'LEFT', line: 7, lineHash: 'x' } })],
      classicDom,
      () => {},
    );
    expect(placed).toBe(1);
    const badge = document.querySelector('[data-lowdiff-badge]')!;
    expect(badge.parentElement!.className).toContain('blob-code-inner');
  });

  it('lands before a trailing newline, not after it', () => {
    // Real GitHub code cells end with "\n" under white-space: pre; an anchor
    // appended after it renders at the start of the NEXT visual line.
    document.documentElement.innerHTML = `
      <div class="file" data-tagsearch-path="src/nl.ts">
        <table><tbody>
          <tr>
            <td class="blob-num" data-line-number="1"></td>
            <td class="blob-num" data-line-number="1"></td>
            <td class="blob-code"><span class="blob-code-inner">const x = 1;
</span></td>
          </tr>
        </tbody></table>
      </div>`;
    clearBadges();
    syncBadges(
      [note({ anchor: { path: 'src/nl.ts', side: 'RIGHT', line: 1, lineHash: 'x' } })],
      classicDom,
      () => {},
    );
    const badge = document.querySelector('[data-lowdiff-badge]')!;
    const after = badge.nextSibling;
    expect(after?.nodeType).toBe(Node.TEXT_NODE);
    expect(after?.textContent).toMatch(/^\s*$/);
    expect(badge.previousSibling?.textContent).toContain('const x = 1;');
  });

  it('survives an empty trailing element after the newline', () => {
    // GitHub emits zero-length spans at syntax boundaries; the deepest-last
    // node is then an element, not text, and the newline sits in an earlier
    // sibling.
    document.documentElement.innerHTML = `
      <div class="file" data-tagsearch-path="src/m.ts">
        <table><tbody>
          <tr>
            <td class="blob-num" data-line-number="1"></td>
            <td class="blob-num" data-line-number="1"></td>
            <td class="blob-code"><span class="blob-code-inner"><span>const x = 1;
</span><span class="marker"></span></span></td>
          </tr>
        </tbody></table>
      </div>`;
    clearBadges();
    syncBadges(
      [note({ anchor: { path: 'src/m.ts', side: 'RIGHT', line: 1, lineHash: 'x' } })],
      classicDom,
      () => {},
    );
    const badge = document.querySelector('[data-lowdiff-badge]')!;
    expect(badge.previousSibling?.textContent).toBe('const x = 1;');
  });

  it('survives a whitespace-only trailing text node', () => {
    // The last TEXT node is a bare space with no newline; the newline is one
    // sibling earlier. Anchoring on "last text node" of any kind still lands
    // on the next visual line.
    document.documentElement.innerHTML = `
      <div class="file" data-tagsearch-path="src/w.ts">
        <table><tbody>
          <tr>
            <td class="blob-num" data-line-number="1"></td>
            <td class="blob-num" data-line-number="1"></td>
            <td class="blob-code"><span class="blob-code-inner"><span>const y = 2;
</span> </span></td>
          </tr>
        </tbody></table>
      </div>`;
    clearBadges();
    syncBadges(
      [note({ anchor: { path: 'src/w.ts', side: 'RIGHT', line: 1, lineHash: 'x' } })],
      classicDom,
      () => {},
    );
    const badge = document.querySelector('[data-lowdiff-badge]')!;
    expect(badge.previousSibling?.textContent).toBe('const y = 2;');
  });

  it('anchors with zero width so text wrapping cannot move it', () => {
    // A badge with real width is a word to the wrapper: end a line near the
    // cell edge and the star wrapped onto its own visual line. A 0×0 inline
    // anchor cannot wrap; the visible dot hangs off it absolutely.
    document.documentElement.innerHTML = FIXTURE;
    clearBadges();
    syncBadges(
      [note({ anchor: { path: PATH, side: 'RIGHT', line: 5, lineHash: 'x' } })],
      classicDom,
      () => {},
    );
    const badge = document.querySelector('[data-lowdiff-badge]') as HTMLElement;
    expect(badge.style.width).toBe('0px');
    expect(badge.style.display).toBe('inline-block');
    const hit = badge.firstElementChild as HTMLElement;
    expect(hit.style.position).toBe('absolute');
  });
});
