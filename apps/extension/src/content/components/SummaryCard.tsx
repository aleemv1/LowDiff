import { useState } from 'preact/hooks';
import type { Mode, Note, NoteKind } from '@lowdiff/core';
import { C, KIND_STYLE } from '../theme.js';
import { Markdown } from './Markdown.js';

interface Props {
  summary: string;
  notes: Note[];
  mode: Mode;
  cached: boolean;
  busy: boolean;
  onMode: (mode: Mode) => void;
  onRefresh: () => void;
}

const LABEL: Partial<Record<NoteKind, string>> = {
  RISK: '⚠ risk',
  SECURITY: '🔒 security',
  BREAKING: '⚡ breaking',
  PERF: 'perf',
  SUGGESTION: 'suggestion',
  EXPLAIN: 'note',
};

function counts(notes: Note[]): [NoteKind, number][] {
  const tally = new Map<NoteKind, number>();
  for (const note of notes) tally.set(note.kind, (tally.get(note.kind) ?? 0) + 1);
  return [...tally.entries()];
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
          ✦
        </span>
        <span style={{ font: `700 13px 'DM Sans',sans-serif`, color: C.ink }}>
          AI review of this pull request
        </span>

        <span style={{ display: 'flex', gap: '6px', marginLeft: '8px', flexWrap: 'wrap' }}>
          {counts(props.notes).map(([kind, n]) => (
            <span
              key={kind}
              class="pill"
              style={{ background: KIND_STYLE[kind]!.headBg, color: KIND_STYLE[kind]!.color }}
            >
              {n} {LABEL[kind]}
            </span>
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
            padding: '0 16px 14px 52px',
            font: `13px/1.65 'DM Sans',sans-serif`,
            color: C.body,
          }}
        >
          {props.busy && props.notes.length === 0 ? (
            'Reading the diff…'
          ) : (
            <Markdown text={props.summary} font="13px/1.65 inherit" />
          )}
          {props.notes.length > 0 && (
            <b style={{ color: C.accentDark, font: '600 12px/1.5 inherit' }}>
              Click the ✦ badges in the diff to see notes on specific lines.
            </b>
          )}
          {props.cached && (
            <span style={{ color: C.faint, fontSize: '11px' }}> · cached for this commit</span>
          )}
        </div>
      )}
    </div>
  );
}
