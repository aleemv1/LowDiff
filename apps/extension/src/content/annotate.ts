import type { Note } from '@lowdiff/core';
import type { DiffDom } from './dom/index.js';
import { KIND_STYLE } from './theme.js';

// Badges live in GitHub's page, not our shadow root, so they cannot read the
// --ld-* variables defined on :host. They use Primer's variables directly.
const ACCENT = 'var(--fgColor-accent, #5b5bd6)';
// Translucent so GitHub's own add/delete row colours still read through.
const HIGHLIGHT_WASH = 'color-mix(in srgb, var(--fgColor-accent, #5b5bd6) 10%, transparent)';

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

      // Absolutely positioned inside the line-number cell, so it sits beside
      // the number without entering any layout GitHub owns. Injecting into the
      // code cell pushed the code onto its own line in the newer view.
      const gutter = target.gutterCell;
      // Treat an empty computed value as unpositioned too: if we skip this,
      // the badge resolves against some distant ancestor and lands nowhere
      // near its line.
      const position = getComputedStyle(gutter).position;
      if (!position || position === 'static') gutter.style.position = 'relative';
      gutter.style.overflow = 'visible';
      gutter.append(badge);
      placed++;
    }
  }

  return placed;
}

const HIGHLIGHT_ATTR = 'data-lowdiff-highlit';

/**
 * Highlight the lines a note is about.
 *
 * A note may cover a whole function; `anchor.endLine` carries that span when
 * the model reported one, so the reader sees the construct rather than one
 * line pulled out of it.
 */
export function highlightNote(note: Note | null, dom: DiffDom): DOMRect | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTR}]`)) {
    el.style.boxShadow = el.getAttribute(HIGHLIGHT_ATTR) ?? '';
    el.removeAttribute(HIGHLIGHT_ATTR);
  }
  if (!note) return null;

  const last = note.anchor.endLine ?? note.anchor.line;
  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;

  for (const line of dom.lines(note.anchor.path)) {
    if (line.side !== note.anchor.side) continue;
    if (line.line < note.anchor.line || line.line > last) continue;

    // Stash whatever was there so the row is restored exactly on close.
    line.row.setAttribute(HIGHLIGHT_ATTR, line.row.style.boxShadow);
    line.row.style.boxShadow = `inset 3px 0 0 0 ${ACCENT}, inset 0 0 0 999px ${HIGHLIGHT_WASH}`;

    const rect = line.row.getBoundingClientRect();
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
  }

  if (bottom === -Infinity) return null;
  return new DOMRect(left, top, right - left, bottom - top);
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
    el.style.transform = on ? 'translateY(-50%) scale(1.2)' : 'translateY(-50%)';
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
    position: 'absolute',
    // Straddles the gutter's right edge so it never covers the line number,
    // however many digits that number has.
    right: '-8px',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '15px',
    height: '15px',
    zIndex: '3',
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
