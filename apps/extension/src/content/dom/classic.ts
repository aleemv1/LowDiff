import type { DiffDom, DomLine, Side } from './types.js';

/**
 * GitHub's server-rendered diff: one `.file` per file, a `.diff-table` inside,
 * and two `td.blob-num` cells per row carrying the old and new line numbers.
 */
export const classicDom: DiffDom = {
  name: 'classic',

  matches(): boolean {
    return document.querySelector('.file[data-tagsearch-path] .diff-table') !== null;
  },

  paths(): string[] {
    return [...document.querySelectorAll('.file[data-tagsearch-path]')]
      .map((el) => el.getAttribute('data-tagsearch-path'))
      .filter((p): p is string => Boolean(p));
  },

  lines(path: string): DomLine[] {
    const file = document.querySelector(
      `.file[data-tagsearch-path="${CSS.escape(path)}"]`,
    );
    if (!file) return [];

    const out: DomLine[] = [];
    for (const row of file.querySelectorAll('tr')) {
      const nums = row.querySelectorAll('td.blob-num');
      const cell = row.querySelector('td.blob-code');
      if (nums.length === 0 || !(cell instanceof HTMLElement)) continue;

      // `.blob-code-inner` is display:table-cell, so a badge placed after it
      // becomes a sibling cell and wraps onto its own line. It has to go
      // inside the span, alongside the syntax-highlighted code.
      const inner = cell.querySelector('.blob-code-inner');
      const codeCell = inner instanceof HTMLElement ? inner : cell;

      // Cell order is [old, new]; a unified row may carry only one of them.
      const sides: Side[] = nums.length === 1 ? ['RIGHT'] : ['LEFT', 'RIGHT'];
      nums.forEach((cell, i) => {
        const raw = cell.getAttribute('data-line-number');
        const side = sides[i];
        if (!raw || !side || !(cell instanceof HTMLElement)) return;
        const line = Number(raw);
        if (!Number.isInteger(line)) return;
        out.push({ side, line, row: row as HTMLElement, codeCell, gutterCell: cell });
      });
    }
    return out;
  },
};
