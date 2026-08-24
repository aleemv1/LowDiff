import type { Note } from '@lowdiff/core';
import type { DiffDom } from './dom/index.js';
import { KIND_STYLE } from './theme.js';

// Badges live in GitHub's page, not our shadow root, so they cannot read the
// --ld-* variables defined on :host. They use Primer's variables directly.
const ACCENT = 'var(--fgColor-accent, #5b5bd6)';

const BADGE_ATTR = 'data-lowdiff-badge';

export interface BadgeTarget {
  note: Note;
  element: HTMLElement;
}

/**
 * Injects note badges into GitHub's own diff rows.
 *
 * These live in the page, not in our shadow root, so every style is inline —
 * a class name here would collide with GitHub's stylesheet, and any rule we
 * added to the page could leak onto their markup.
 */
export function syncBadges(
  notes: readonly Note[],
  dom: DiffDom,
  onSelect: (target: BadgeTarget) => void,
): number {
  clearBadges();

  const byPath = new Map<string, Note[]>();
  for (const note of notes) {
    const list = byPath.get(note.anchor.path);
    if (list) list.push(note);
    else byPath.set(note.anchor.path, [note]);
  }

  let placed = 0;

  for (const [path, pathNotes] of byPath) {
    const lines = dom.lines(path);
    if (lines.length === 0) continue;

    const index = new Map<string, (typeof lines)[number]>();
    for (const line of lines) index.set(`${line.side}:${line.line}`, line);

    for (const note of pathNotes) {
      const target = index.get(`${note.anchor.side}:${note.anchor.line}`);
      if (!target) continue;

      const badge = createBadge(note);
      badge.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect({ note, element: badge });
      });

      // The adapter has already resolved the element that actually holds the
      // code text, so the badge sits inline beside it.
      target.codeCell.append(badge);
      placed++;
    }
  }

  return placed;
}

export function clearBadges(): void {
  for (const badge of document.querySelectorAll(`[${BADGE_ATTR}]`)) badge.remove();
}

/** Highlight the badge whose note is currently open. */
export function setActiveBadge(active: HTMLElement | null): void {
  for (const el of document.querySelectorAll<HTMLElement>(`[${BADGE_ATTR}]`)) {
    const kind = el.getAttribute('data-lowdiff-kind') ?? 'EXPLAIN';
    const style = KIND_STYLE[kind] ?? KIND_STYLE['EXPLAIN']!;
    const on = el === active;
    el.style.background = on ? ACCENT : 'var(--bgColor-default, #fff)';
    el.style.color = on ? '#fff' : style.color;
    el.style.transform = on ? 'scale(1.2)' : 'none';
  }
}

function createBadge(note: Note): HTMLElement {
  const style = KIND_STYLE[note.kind] ?? KIND_STYLE['EXPLAIN']!;
  const badge = document.createElement('span');
  badge.setAttribute(BADGE_ATTR, '');
  badge.setAttribute('data-lowdiff-kind', note.kind);
  badge.setAttribute('role', 'button');
  badge.setAttribute('tabindex', '0');
  badge.title = `${note.kind}: ${note.title}`;
  badge.textContent = '✦';
  Object.assign(badge.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    verticalAlign: 'middle',
    marginLeft: '10px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: `1.5px solid ${ACCENT}`,
    background: 'var(--bgColor-default, #fff)',
    color: style.color,
    font: '700 10px -apple-system, BlinkMacSystemFont, sans-serif',
    lineHeight: '1',
    cursor: 'pointer',
    userSelect: 'none',
    flex: 'none',
    whiteSpace: 'normal',
  } satisfies Partial<CSSStyleDeclaration>);
  return badge;
}
