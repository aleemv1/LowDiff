import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Note, NoteKind } from '@lowdiff/core';
import { noteKey } from '../annotate.js';
import { KIND_STYLE } from '../theme.js';
import { SPARKLE_PATH } from './Sparkle.js';

interface Props {
  notes: readonly Note[];
  placedKeys: readonly string[];
  activeKey: string | null;
  busy: boolean;
  chatOpen: boolean;
  onToggleChat: () => void;
  onNav: (step: number) => void;
  onSelect: (note: Note) => void;
}

const ICONS: Record<NoteKind, string> = {
  RISK: 'M8 2 15 14H1L8 2Zm0 4v4m0 1.5v1',
  SECURITY: 'M8 1 14 3v5c0 3-3 5-6 7-3-2-6-4-6-7V3l6-2Zm0 4v4m0 1.5v1',
  BREAKING: 'm9 1-6 8h4l-1 6 7-9H9l1-5',
  PERF: 'M2 9h2v6H2V9Zm5-4h2v10H7V5Zm5-4h2v14h-2V1Z',
  EXPLAIN: 'M3 1h7l3 3v11H3V1Zm7 0v4h3M5 8h6M5 11h6',
  SUGGESTION: 'M5 12h6m-5 3h4M5 10C0 5 4 1 8 1s8 4 3 9H5Z',
};

function Chevron({ direction }: { direction: 'left' | 'right' | 'up' | 'down' }) {
  const path = { left: 'm10 4-4 4 4 4', right: 'm6 4 4 4-4 4', up: 'm4 10 4-4 4 4', down: 'm4 6 4 4 4-4' }[direction];
  return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d={path} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>;
}

/** Lives in the body-level overlay so it stays reachable as the diff scrolls. */
export function AnnotationDock({ notes, placedKeys, activeKey, busy, chatOpen, onToggleChat, onNav, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const focusInMenu = useRef(false);
  const menuId = useId();
  const starId = useId();
  const available = useMemo(() => new Set(placedKeys), [placedKeys]);
  const current = notes.findIndex(note => noteKey(note) === activeKey);
  const position = `${current + 1}/${notes.length}`;
  const hasNotes = notes.length > 0;

  // Recover a removed/disabled row without stealing focus from a surviving row
  // or from the dock controls. Read the shadow root's active element in Chrome.
  useLayoutEffect(() => {
    const panel = menu.current;
    if (!open || !panel) { wasOpen.current = false; return; }
    const opening = !wasOpen.current;
    wasOpen.current = true;
    const tree = panel.getRootNode() as Document | ShadowRoot;
    const focused = tree.activeElement;
    const valid = focused instanceof HTMLButtonElement && !focused.disabled && panel.contains(focused);
    if (!opening && (!focusInMenu.current || valid)) return;
    const target = panel.querySelector<HTMLButtonElement>('button[aria-current="true"]:not(:disabled)')
      ?? panel.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? panel;
    target.focus({ preventScroll: true });
    // Reveal the selected row by scrolling just the list, never the PR page.
    const list = panel.querySelector('ul');
    if (list?.contains(target)) {
      const row = target.getBoundingClientRect();
      const viewport = list.getBoundingClientRect();
      if (row.top < viewport.top) list.scrollTop -= viewport.top - row.top;
      else if (row.bottom > viewport.bottom) list.scrollTop += row.bottom - viewport.bottom;
    }
  }, [open, notes, placedKeys]);

  useEffect(() => {
    if (!open || !hasNotes) return;
    const outside = (event: PointerEvent) => {
      if (root.current && !event.composedPath().includes(root.current)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, hasNotes]);

  useEffect(() => { if (!hasNotes || chatOpen) setOpen(false); }, [hasNotes, chatOpen]);

  if (!hasNotes && !busy) return null;

  return <nav ref={root} class={`annotation-dock${chatOpen ? ' with-chat' : ''}`} aria-label="Annotation navigation"
    onFocusIn={event => { focusInMenu.current = menu.current?.contains(event.target as Node) ?? false; }}
    onKeyDown={event => {
      if (event.key !== 'Escape' || !open) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    }}
    onFocusOut={event => {
      if (event.relatedTarget instanceof Node && !root.current?.contains(event.relatedTarget)) setOpen(false);
    }}>
    {open && hasNotes && <div ref={menu} id={menuId} class="annotation-jump-menu" role="dialog" aria-label="Jump to annotation" tabIndex={-1}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('li button:not(:disabled)') ?? [])];
        const at = buttons.indexOf(event.target as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
      <div class="annotation-jump-heading"><strong>Jump to annotation</strong><span>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</span></div>
      <ul class="annotation-jump-list">
        {notes.map(note => {
          const key = noteKey(note);
          const loaded = available.has(key);
          return <li key={key}>
            <button type="button" class="annotation-jump-row" disabled={!loaded}
              aria-current={key === activeKey ? 'true' : undefined}
              title={loaded ? `${note.kind}: ${note.title}` : 'Expand or load this file on GitHub to jump to the annotation.'}
              onClick={() => { setOpen(false); onSelect(note); }}>
              <svg class="annotation-kind-icon" width="18" height="18" viewBox="0 0 16 16" aria-label={note.kind} role="img"
                style={{ color: KIND_STYLE[note.kind]!.color }}>
                <path d={ICONS[note.kind]} fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" />
              </svg>
              <span class="annotation-jump-copy"><span class="annotation-jump-title">{note.title}</span>
                <span class="annotation-jump-source">{note.anchor.path}:{note.anchor.line}{note.anchor.side === 'LEFT' ? ' (deleted)' : ''}</span>
              </span>
              {!loaded && <span class="annotation-unavailable">Not loaded</span>}
            </button>
          </li>;
        })}
      </ul>
      {notes.some(note => !available.has(noteKey(note))) && <p class="annotation-jump-hint">Expand or load files on GitHub to jump to the remaining annotations.</p>}
    </div>}
    <div class="annotation-dock-bar">
      <button class="annotation-dock-mark" type="button"
        title={chatOpen ? 'Hide LowDiff chat' : 'Open LowDiff chat'} aria-label={chatOpen ? 'Hide LowDiff chat' : 'Open LowDiff chat'}
        aria-expanded={chatOpen} onClick={event => {
          setOpen(false);
          if (chatOpen) event.currentTarget.focus({ preventScroll: true });
          onToggleChat();
        }}>
        <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true">
          <defs>
            <clipPath id={`${starId}-clip`}><path d={SPARKLE_PATH} /></clipPath>
            <linearGradient id={`${starId}-shine`} x1="0%" y1="0%" x2="100%" y2="35%">
              <stop offset="0%" stop-color="#fff" stop-opacity="0" />
              <stop offset="50%" stop-color="#fff" stop-opacity=".95" />
              <stop offset="100%" stop-color="#fff" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path d={SPARKLE_PATH} fill="currentColor" />
          <g clip-path={`url(#${starId}-clip)`}>
            <rect class="annotation-star-sheen" x="-16" y="-8" width="12" height="32" fill={`url(#${starId}-shine)`} />
          </g>
        </svg>
      </button>
      {hasNotes && <>
        <button class="annotation-dock-button" type="button" aria-label="Previous annotation" title="Previous annotation"
          disabled={placedKeys.length === 0} onClick={() => onNav(-1)}><Chevron direction="left" /></button>
        <button ref={trigger} class="annotation-dock-button annotation-dock-count" type="button" aria-label={`Jump to annotation, ${position}`}
          aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined}
          onClick={() => setOpen(value => !value)}
          onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>
          <span>{position}</span>
          <Chevron direction={open ? 'down' : 'up'} />
        </button>
        <button class="annotation-dock-button" type="button" aria-label="Next annotation" title="Next annotation"
          disabled={placedKeys.length === 0} onClick={() => onNav(1)}><Chevron direction="right" /></button>
      </>}
      {busy && <span class="annotation-dock-progress" role="status" title={hasNotes ? 'Reviewing again. Showing the previous review until the new one is ready.' : undefined}>
        <span class="annotation-spinner" aria-hidden="true" />Reviewing…
      </span>}
    </div>
  </nav>;
}
