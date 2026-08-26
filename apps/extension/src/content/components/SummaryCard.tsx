import { useEffect, useRef, useState } from 'preact/hooks';
import type { Mode, Note, NoteKind } from '@lowdiff/core';
import { C, KIND_STYLE, glowFor } from '../theme.js';
import { Sparkle } from './Sparkle.js';
import { Markdown } from './Markdown.js';

interface Props {
  summary: string;
  notes: Note[];
  mode: Mode;
  cached: boolean;
  busy: boolean;
  onMode: (mode: Mode) => void;
  onRefresh: () => void;
  onJump: (kind: NoteKind) => void;
  onJumpNote: (note: Note) => void;
}

const LABEL: Partial<Record<NoteKind, { one: string; many: string }>> = {
  RISK: { one: '⚠ risk', many: '⚠ risks' },
  SECURITY: { one: '🔒 security', many: '🔒 security' },
  BREAKING: { one: '⚡ breaking', many: '⚡ breaking' },
  PERF: { one: 'perf', many: 'perf' },
  SUGGESTION: { one: 'suggestion', many: 'suggestions' },
  EXPLAIN: { one: 'note', many: 'notes' },
};

/** Chips read left to right from most to least severe. */
const KIND_ORDER: NoteKind[] = ['SECURITY', 'RISK', 'BREAKING', 'PERF', 'SUGGESTION', 'EXPLAIN'];

function counts(notes: Note[]): [NoteKind, number][] {
  const tally = new Map<NoteKind, number>();
  for (const note of notes) tally.set(note.kind, (tally.get(note.kind) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => KIND_ORDER.indexOf(a[0]) - KIND_ORDER.indexOf(b[0]));
}

export function SummaryCard(props: Props) {
  const [open, setOpen] = useState(true);
  // Chips glow like unopened badges until their first click, so the jump
  // affordance is discoverable without a label.
  const [jumped, setJumped] = useState<Partial<Record<NoteKind, true>>>({});

  // On a wide card, the space to the right of the capped summary carries the
  // findings list instead of sitting empty.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setWide(el.getBoundingClientRect().width >= 1000),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      style={{
        border: `1px solid ${C.accentBorder}`,
        borderRadius: '12px',
        // Solid, not a gradient: the old fade was mixed from a hardcoded
        // light tint, so on a dark theme the card faded to the wrong colour.
        background: C.surface,
        marginBottom: '16px',
        // Clears GitHub's sticky PR header when the card is scrolled to.
        scrollMarginTop: '120px',
        boxShadow: 'none',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px' }}>
        <span
          style={{
            width: '26px', height: '26px', borderRadius: '8px', background: C.accent,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '13px', flex: 'none',
          }}
        >
          <Sparkle size={13} />
        </span>
        <span style={{ font: `700 13px 'DM Sans',sans-serif`, color: C.ink }}>
          AI review of this pull request
        </span>

        <span style={{ display: 'flex', gap: '6px', marginLeft: '8px', flexWrap: 'wrap' }}>
          {counts(props.notes).map(([kind, n]) => (
            <button
              key={kind}
              class="pill"
              onClick={() => {
                setJumped((prev) => ({ ...prev, [kind]: true }));
                props.onJump(kind);
              }}
              title={`Jump to the next ${LABEL[kind]!.one} badge in the diff`}
              style={{
                background: KIND_STYLE[kind]!.headBg,
                color: KIND_STYLE[kind]!.color,
                border: '1px solid color-mix(in srgb, currentColor 40%, transparent)',
                cursor: 'pointer',
                boxShadow: jumped[kind] ? 'none' : glowFor(KIND_STYLE[kind]!.color),
              }}
            >
              {n} {n === 1 ? LABEL[kind]!.one : LABEL[kind]!.many} ↓
            </button>
          ))}
          {props.notes.length === 0 && !props.busy && (
            <span class="pill" style={{ background: '#e9f8ec', color: '#1a7f37' }}>
              nothing flagged
            </span>
          )}
        </span>

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'flex', border: `1px solid ${C.line}`, borderRadius: '999px', overflow: 'hidden' }}>
            {(['review', 'explain'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => props.onMode(m)}
                style={{
                  border: 'none', cursor: 'pointer', padding: '4px 12px',
                  font: `600 10.5px 'DM Sans',sans-serif`,
                  background: props.mode === m ? C.accent : 'transparent',
                  color: props.mode === m ? '#fff' : C.muted,
                }}
              >
                {m === 'review' ? 'Review' : 'Explain'}
              </button>
            ))}
          </span>
          <button
            class="btn btn-ghost"
            style={{ padding: '4px 10px' }}
            disabled={props.busy}
            onClick={props.onRefresh}
            title="Re-run against the current commit"
          >
            {props.busy ? '…' : '↻'}
          </button>
          <span
            onClick={() => setOpen(!open)}
            style={{ cursor: 'pointer', color: C.faint, fontSize: '13px', padding: '2px 6px' }}
          >
            {open ? '▴' : '▾'}
          </span>
        </span>
      </div>

      {open && (
        <div
          style={{
            display: 'flex', gap: '40px', alignItems: 'flex-start',
            padding: '0 16px 14px 52px',
            font: `13px/1.65 'DM Sans',sans-serif`,
            color: C.body,
          }}
        >
          {/* The prose fills everything up to the findings list. */}
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            {props.busy && props.notes.length === 0 ? (
              'Reading the diff…'
            ) : (
              <Markdown text={props.summary} font="13px/1.65 inherit" />
            )}
            {(props.notes.length > 0 || props.cached) && (
              <div
                style={{
                  display: 'flex', alignItems: 'baseline', gap: '4px 12px',
                  flexWrap: 'wrap', marginTop: '8px',
                }}
              >
                {props.notes.length > 0 && (
                  <span style={{ color: C.muted, font: '12px/1.5 inherit' }}>
                    <span style={{ color: C.accentDark }}>✦</span>{' '}
                    Click a count to jump, or any badge in the diff.
                  </span>
                )}
                {props.cached && (
                  <span
                    style={{
                      marginLeft: 'auto', color: C.faint, fontSize: '11px', whiteSpace: 'nowrap',
                    }}
                  >
                    cached for this commit
                  </span>
                )}
              </div>
            )}
          </div>

          {wide && props.notes.length > 0 && (
            <div
              style={{
                flex: '0 1 460px', minWidth: '300px',
                borderLeft: `1px solid ${C.line}`, padding: '2px 0 0 24px',
              }}
            >
              {props.notes.map((note) => (
                <div
                  key={`${note.anchor.path}:${note.anchor.line}:${note.title}`}
                  data-lowdiff-finding
                  onClick={() => props.onJumpNote(note)}
                  title={`Jump to ${note.anchor.path}:${note.anchor.line}`}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: '10px',
                    padding: '4px 0', cursor: 'pointer',
                    font: `12.5px/1.45 'DM Sans',sans-serif`,
                  }}
                >
                  <span
                    style={{
                      width: '8px', height: '8px', borderRadius: '50%', flex: 'none',
                      background: KIND_STYLE[note.kind]!.color, transform: 'translateY(-1px)',
                    }}
                  />
                  <span
                    style={{
                      color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {note.title}
                  </span>
                  <span
                    class="mono"
                    style={{ marginLeft: 'auto', color: C.faint, fontSize: '11px', whiteSpace: 'nowrap' }}
                  >
                    {note.anchor.path.split('/').pop()}:{note.anchor.line}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
