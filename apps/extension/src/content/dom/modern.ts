import type { DiffDom, DomLine, Side } from './types.js';

/**
 * GitHub's client-rendered diff (the `/changes` tab).
 *
 * Every class name in this view is a build-hashed CSS module
 * (`DiffComparisonViewer-module__Container__YGBgR`) that changes on each
 * GitHub deploy, so nothing here keys off class names. The `data-*` hooks
 * below are stable and semantic:
 *
 *   table[role=grid][aria-label="Diff for: <path>"]   one per file
 *     td[data-line-number][data-diff-side]            two cells per line
 *       - the line-number cell carries data-first-unified-line-number-cell
 *       - the code cell carries data-line-anchor
 *
 * `data-diff-side` is lowercase here ("right"), unlike the note anchors we
 * store, which use GitHub's API casing ("RIGHT").
 */
const FILE_SELECTOR = 'table[role="grid"][aria-label]';
const LABEL_PREFIX = 'Diff for: ';

function fileTables(): HTMLTableElement[] {
  return [...document.querySelectorAll(FILE_SELECTOR)]
    .filter((el): el is HTMLTableElement => el instanceof HTMLTableElement)
    .filter((el) => (el.getAttribute('aria-label') ?? '').startsWith(LABEL_PREFIX));
}

function pathOf(table: HTMLTableElement): string {
  return (table.getAttribute('aria-label') ?? '').slice(LABEL_PREFIX.length).trim();
}

export const modernDom: DiffDom = {
  name: 'modern',

  matches(): boolean {
    return fileTables().length > 0;
  },

  paths(): string[] {
    return fileTables().map(pathOf).filter(Boolean);
  },

  lines(path: string): DomLine[] {
    const table = fileTables().find((t) => pathOf(t) === path);
    if (!table) return [];

    const out: DomLine[] = [];
    // The code cell is the one carrying data-line-anchor; its sibling with the
    // same line number is the gutter, which has no room for a badge.
    for (const cell of table.querySelectorAll('[data-line-number][data-line-anchor]')) {
      if (!(cell instanceof HTMLElement)) continue;

      const line = Number(cell.getAttribute('data-line-number'));
      if (!Number.isInteger(line) || line < 1) continue;

      const side: Side =
        cell.getAttribute('data-diff-side')?.toLowerCase() === 'left' ? 'LEFT' : 'RIGHT';

      const row = cell.closest('tr');
      out.push({
        side,
        line,
        row: row instanceof HTMLElement ? row : cell,
        codeCell: cell,
      });
    }
    return out;
  },
};
