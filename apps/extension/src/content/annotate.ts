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
[${BADGE_ATTR}] > span > span { animation: lowdiff-pulse 2.4s ease-in-out infinite; }
[${BADGE_ATTR}][${VISITED_ATTR}] > span > span { animation: none; }
@media (prefers-reduced-motion: reduce) {
  [${BADGE_ATTR}] > span > span { animation: none; }
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

      // Trails the code text, where the reader's eye finishes the line —
      // BEFORE any trailing newline. GitHub's cells render white-space: pre
      // and end with "\n"; an anchor appended after it starts the next
      // visual line instead of ending this one.
      insertAtLineEnd(target.codeCell, badge);
      placed++;
    }
  }

  return placed;
}

/**
 * Append at the visual end of the line: after the last visible character.
 * The anchor is the last text node containing non-whitespace — the trailing
 * newline may live in a later sibling, and the deepest-last node may be an
 * empty marker element, a <br>, or bare whitespace.
 */
function lastContentfulText(node: Node): Text | null {
  // Hand-rolled rather than TreeWalker: the walk is trivial, and happy-dom
  // (the test environment) does not implement TreeWalker text traversal.
  let found: Text | null = null;
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (/\S/.test(child.textContent ?? '')) found = child as Text;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const inner = lastContentfulText(child);
      if (inner) found = inner;
    }
  }
  return found;
}

function insertAtLineEnd(cell: HTMLElement, badge: HTMLElement): void {
  const anchor = lastContentfulText(cell);
  if (!anchor?.parentNode) {
    cell.append(badge);
    return;
  }
  const tail = /\s+$/.exec(anchor.textContent ?? '');
  if (tail && tail.index > 0) anchor.splitText(tail.index);
  anchor.parentNode.insertBefore(badge, anchor.nextSibling);
}

const INLINE_ATTR = 'data-lowdiff-inline';
/** SECURITY and RISK earn a visible row; the rest wait behind their star. */
const INLINE_KINDS = new Set(['SECURITY', 'RISK']);
/** Session-scoped: a dismissed strip stays dismissed across re-syncs. */
const dismissedInline = new Set<string>();

/**
 * Important notes show themselves: a slim tinted row under the cited line,
 * exactly how GitHub renders its own inline comments — a sibling <tr>
 * spanning the row's cells. Clicking it opens the full note; ✕ dismisses it
 * for the session (the star remains).
 */
export function syncInlineNotes(
  notes: readonly Note[],
  dom: DiffDom,
  onSelect: (target: BadgeTarget) => void,
): void {
  for (const el of document.querySelectorAll(`[${INLINE_ATTR}]`)) el.remove();

  for (const note of notes) {
    if (!INLINE_KINDS.has(note.kind) || dismissedInline.has(noteKey(note))) continue;
    const line = dom
      .lines(note.anchor.path)
      .find((l) => l.side === note.anchor.side && l.line === note.anchor.line);
    const row = line?.row.closest('tr') ?? line?.row;
    if (!(row instanceof HTMLTableRowElement)) continue;

    const color = kindColor(note.kind);
    const strip = document.createElement('tr');
    strip.setAttribute(INLINE_ATTR, '');
    const cell = document.createElement('td');
    cell.colSpan = row.children.length;
    Object.assign(cell.style, {
      padding: '4px 10px 4px 62px',
      background: `color-mix(in srgb, ${color} 7%, transparent)`,
      borderLeft: `3px solid ${color}`,
      cursor: 'pointer',
      font: '12px/1.5 -apple-system, BlinkMacSystemFont, sans-serif',
      color: 'var(--fgColor-default, #1f2328)',
      whiteSpace: 'normal',
    } satisfies Partial<CSSStyleDeclaration>);

    const kind = document.createElement('span');
    kind.textContent = note.kind;
    Object.assign(kind.style, {
      color, font: '700 9.5px -apple-system, sans-serif', letterSpacing: '.04em',
      marginRight: '8px',
    } satisfies Partial<CSSStyleDeclaration>);
    const title = document.createElement('span');
    title.textContent = note.title;
    const dismiss = document.createElement('span');
    dismiss.textContent = '✕';
    Object.assign(dismiss.style, {
      float: 'right', color: 'var(--fgColor-muted, #59636e)', padding: '0 4px',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    dismiss.addEventListener('click', (event) => {
      event.stopPropagation();
      dismissedInline.add(noteKey(note));
      strip.remove();
    });
    cell.append(kind, title, dismiss);
    cell.addEventListener('click', () => onSelect({ note, element: cell }));
    strip.append(cell);
    row.after(strip);
  }
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
  for (const strip of document.querySelectorAll(`[${INLINE_ATTR}]`)) strip.remove();
}

/** Highlight the badge whose note is currently open. */
export function setActiveBadge(active: HTMLElement | null): void {
  for (const el of document.querySelectorAll<HTMLElement>(`[${BADGE_ATTR}]`)) {
    const color = kindColor(el.getAttribute('data-lowdiff-kind') ?? 'EXPLAIN');
    const on = el === active;
    // The anchor holds the hit area, which holds the dot; paint the dot.
    const visual = el.firstElementChild?.firstElementChild;
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
  // Three elements: a 0×0 inline anchor at the end of the text, a clickable
  // hit area hung off it absolutely, and the visual dot inside that. A badge
  // with real width is a word to the line-wrapper — end a line near the cell
  // edge and the star wrapped onto its own visual line. Zero size cannot
  // wrap and cannot move layout; the dot floats beside the final character.
  Object.assign(badge.style, {
    display: 'inline-block',
    width: '0',
    height: '0',
    overflow: 'visible',
    position: 'relative',
    verticalAlign: 'baseline',
    userSelect: 'none',
    whiteSpace: 'normal',
  } satisfies Partial<CSSStyleDeclaration>);

  const hit = document.createElement('span');
  Object.assign(hit.style, {
    position: 'absolute',
    left: '3px',
    top: '-19px',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: '3',
  } satisfies Partial<CSSStyleDeclaration>);
  badge.append(hit);

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
  hit.append(visual);
  return badge;
}
