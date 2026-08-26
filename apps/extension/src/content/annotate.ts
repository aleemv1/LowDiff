import type { Note } from '@lowdiff/core';
import type { DiffDom } from './dom/index.js';
import { SPARKLE_SVG } from './components/Sparkle.js';
import { glowFor } from './theme.js';

// Badges live in GitHub's page, not our shadow root, so they cannot read the
// --ld-* variables defined on :host. They use Primer's variables directly.
const ACCENT = 'var(--fgColor-accent, #5b5bd6)';

/**
 * Kind colours for badges, in PRIMER variables. KIND_STYLE from the theme is
 * scoped to our shadow root's :host — in the page those vars are undefined,
 * so borders fell back to the text colour and the glow's color-mix dropped
 * silently. Everything here must resolve in GitHub's own context.
 */
const KIND_COLOR: Record<string, string> = {
  RISK: 'var(--fgColor-danger, #d1242f)',
  SECURITY: 'var(--fgColor-danger, #d1242f)',
  BREAKING: 'var(--fgColor-attention, #9a6700)',
  PERF: 'var(--fgColor-accent, #0969da)',
  SUGGESTION: 'var(--fgColor-success, #1a7f37)',
  EXPLAIN: 'var(--fgColor-muted, #59636e)',
};
const kindColor = (kind: string): string => KIND_COLOR[kind] ?? KIND_COLOR['EXPLAIN']!;
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
const STYLE_ID = 'lowdiff-badge-style';
const VISITED_ATTR = 'data-lowdiff-visited';

/**
 * The pulse means "you have not looked at this yet", so it ends for good at
 * the first click. Keyed off the note, not the element — badges are torn
 * down and rebuilt whenever the rendered diff changes.
 */
const visited = new Set<string>();
const noteKey = (note: Note): string =>
  `${note.kind}:${note.anchor.path}:${note.anchor.line}:${note.title}`;

/**
 * Badges are styled inline, but a pulse needs @keyframes, which cannot be
 * inlined — one attribute-scoped style element carries them. Nothing here
 * can leak onto GitHub's markup: every rule is behind our data attribute.
 */
function ensureBadgeStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@keyframes lowdiff-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }
}
[${BADGE_ATTR}] > span { animation: lowdiff-pulse 2.4s ease-in-out infinite; }
[${BADGE_ATTR}][${VISITED_ATTR}] > span { animation: none; }
@media (prefers-reduced-motion: reduce) {
  [${BADGE_ATTR}] > span { animation: none; }
}
`;
  document.head.append(style);
}

export function syncBadges(
  notes: readonly Note[],
  dom: DiffDom,
  onSelect: (target: BadgeTarget) => void,
): number {
  ensureBadgeStyle();
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
      if (visited.has(noteKey(note))) badge.setAttribute(VISITED_ATTR, '');
      badge.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        visited.add(noteKey(note));
        badge.setAttribute(VISITED_ATTR, '');
        onSelect({ note, element: badge });
      });
      // Clicking would focus the badge (it is tabbable), and focusing makes
      // the browser scroll it into view — a scroll event on the same click
      // that opened the popover, which anything scroll-sensitive misreads.
      badge.addEventListener('mousedown', (event) => event.preventDefault());

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
    const color = kindColor(el.getAttribute('data-lowdiff-kind') ?? 'EXPLAIN');
    const on = el === active;
    // The outer element is only the hit area; paint the inner dot.
    const visual = el.firstElementChild;
    if (!(visual instanceof HTMLElement)) continue;
    visual.style.background = on ? ACCENT : 'var(--bgColor-default, #fff)';
    visual.style.color = on ? '#fff' : color;
    visual.style.border = `1.5px solid ${on ? ACCENT : color}`;
    visual.style.boxShadow = glowFor(on ? ACCENT : color);
    visual.style.transform = on ? 'scale(1.2)' : 'none';
    // The open note's badge holds still, so its size reads as selection.
    visual.style.animation = on ? 'none' : '';
  }
}

function createBadge(note: Note): HTMLElement {
  const color = kindColor(note.kind);
  const badge = document.createElement('span');
  badge.setAttribute(BADGE_ATTR, '');
  badge.setAttribute('data-lowdiff-kind', note.kind);
  badge.setAttribute('role', 'button');
  badge.setAttribute('tabindex', '0');
  badge.title = `${note.kind}: ${note.title}`;
  // Two elements: an invisible ~26px hit area and the 15px visual dot inside
  // it. A 15px target alone is genuinely hard to click; growing the dot would
  // shout, so padding does the work instead.
  Object.assign(badge.style, {
    position: 'absolute',
    // Straddles the gutter's right edge so it never covers the line number,
    // however many digits that number has.
    right: '-13px',
    // Centred on the FIRST text line, not the cell: when a long line
    // soft-wraps, the cell grows but the line number stays top-aligned, and a
    // 50% badge floats between the wrapped rows. 1lh tracks the line height.
    top: '10px',
    transform: 'translateY(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    zIndex: '3',
    cursor: 'pointer',
    userSelect: 'none',
    flex: 'none',
    whiteSpace: 'normal',
  } satisfies Partial<CSSStyleDeclaration>);
  // Overrides the 10px fallback where the lh unit is supported (Chrome 109+).
  badge.style.top = '0.5lh';

  const visual = document.createElement('span');
  visual.innerHTML = SPARKLE_SVG; // static constant, never model data
  Object.assign(visual.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '15px',
    height: '15px',
    borderRadius: '50%',
    border: `1.5px solid ${color}`,
    background: 'var(--bgColor-default, #fff)',
    color: color,
    boxShadow: glowFor(color),
    font: '700 10px -apple-system, BlinkMacSystemFont, sans-serif',
    lineHeight: '1',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  badge.append(visual);
  return badge;
}
