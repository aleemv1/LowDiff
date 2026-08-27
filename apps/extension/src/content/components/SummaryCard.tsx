import { useState } from 'preact/hooks';
import type { Note, NoteKind } from '@lowdiff/core';
import { C, KIND_STYLE } from '../theme.js';
import { Sparkle } from './Sparkle.js';
import { Markdown } from './Markdown.js';

interface Props {
  summary: string;
  notes: Note[];
  cached: boolean;
  busy: boolean;
  onRefresh: () => void;
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

  return (
    <div
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

        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px', flexWrap: 'wrap' }}>
          {counts(props.notes).map(([kind, n]) => (
            <span
              key={kind}
              class="pill"
              style={{ background: KIND_STYLE[kind]!.headBg, color: KIND_STYLE[kind]!.color }}
            >
              {n} {n === 1 ? LABEL[kind]!.one : LABEL[kind]!.many}
            </span>
          ))}
          {props.notes.length === 0 && !props.busy && (
            <span class="pill" style={{ background: '#e9f8ec', color: '#1a7f37' }}>
              nothing flagged
            </span>
          )}
        </span>

        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            padding: '0 16px 14px 52px',
            font: `13px/1.65 'DM Sans',sans-serif`,
            color: C.body,
          }}
        >
          <div>
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
                    Click a badge in the diff for the note on that line.
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

        </div>
      )}
    </div>
  );
}
