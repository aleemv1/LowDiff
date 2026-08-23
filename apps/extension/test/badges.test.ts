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
