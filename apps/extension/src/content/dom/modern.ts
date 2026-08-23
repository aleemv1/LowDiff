import type { DiffDom, DomLine, Side } from './types.js';

/**
 * GitHub's client-rendered diff (the `/changes` tab).
 *
 * Rolled out per-account, so it cannot be observed while logged out. The
 * selectors below are ordered most-specific first and the adapter reports no
 * lines rather than guessing when none of them match — a wrong row is worse
 * than no badge.
 */
const FILE_SELECTORS = [
  '[data-testid="diff-file"]',
  '[data-file-path]',
  'div[id^="diff-"][data-path]',
];

const PATH_ATTRS = ['data-file-path', 'data-path', 'data-tagsearch-path'];

function fileElements(): HTMLElement[] {
  for (const selector of FILE_SELECTORS) {
    const found = [...document.querySelectorAll(selector)].filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    if (found.length > 0) return found;
  }
  return [];
}

function pathOf(el: HTMLElement): string | null {
  for (const attr of PATH_ATTRS) {
    const value = el.getAttribute(attr);
    if (value) return value;
  }
  return null;
}

export const modernDom: DiffDom = {
  name: 'modern',

  matches(): boolean {
    return fileElements().some((el) => pathOf(el) !== null);
  },

  paths(): string[] {
    return fileElements()
      .map(pathOf)
      .filter((p): p is string => Boolean(p));
  },

  lines(path: string): DomLine[] {
    const file = fileElements().find((el) => pathOf(el) === path);
    if (!file) return [];

    const out: DomLine[] = [];
    for (const row of file.querySelectorAll('[data-line-number], .react-line-number')) {
      if (!(row instanceof HTMLElement)) continue;
      const raw = row.getAttribute('data-line-number') ?? row.textContent?.trim() ?? '';
      const line = Number(raw);
      if (!Number.isInteger(line) || line < 1) continue;

      const container = row.closest<HTMLElement>('[data-testid="diff-row"], tr, .diff-line-row');
      if (!container) continue;

      const codeCell =
        container.querySelector<HTMLElement>('[data-testid="diff-line-content"], .diff-text, td:last-child') ??
        container;

      // The newer view marks deletions on the left column; without an explicit
      // marker we treat the row as right-side, which is where notes usually go.
      const side: Side = row.getAttribute('data-side') === 'LEFT' ? 'LEFT' : 'RIGHT';
      out.push({ side, line, row: container, codeCell });
    }
    return out;
  },
};
