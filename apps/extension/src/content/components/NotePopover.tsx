import type { Note } from '@lowdiff/core';
import { C, KIND_STYLE } from '../theme.js';

interface Props {
  note: Note;
  onClose: () => void;
  onAsk: (note: Note) => void;
}

export function NotePopover({ note, onClose, onAsk }: Props) {
  const style = KIND_STYLE[note.kind]!;

  return (
    <div
      style={{
        position: 'absolute', right: '42px', top: '100%', marginTop: '6px', zIndex: 40,
        width: '440px', maxWidth: 'calc(100% - 60px)', background: C.surface,
        border: `1px solid ${C.line}`, borderRadius: '12px',
        boxShadow: '0 12px 32px rgba(20,30,60,.16)', animation: 'notePop .14s ease-out',
        whiteSpace: 'normal', overflow: 'hidden', textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '11px 14px', background: style.headBg }}>
        <span
          style={{
            background: '#fff', color: style.color, borderRadius: '999px', padding: '3px 10px',
            font: `700 10px 'DM Sans',sans-serif`, letterSpacing: '.03em',
          }}
        >
          {note.kind}
        </span>
        <span style={{ font: `700 12.5px 'DM Sans',sans-serif`, color: C.ink }}>{note.title}</span>
        {note.confidence === 'medium' && (
          <span
            title="Depends on code outside this diff"
            style={{ font: `600 9.5px 'DM Sans',sans-serif`, color: C.faint, border: `1px solid ${C.line}`, borderRadius: '999px', padding: '2px 7px', background: '#fff' }}
          >
            unverified
          </span>
        )}
        <span
          onClick={onClose}
          style={{ marginLeft: 'auto', cursor: 'pointer', color: C.faint, fontSize: '13px', padding: '2px 6px' }}
        >
          ✕
        </span>
      </div>

      <div style={{ padding: '12px 14px', font: `12.5px/1.6 'DM Sans',sans-serif`, color: C.body }}>
        {note.body}
      </div>

      {note.code && (
        <div
          class="mono"
          style={{
            margin: '0 14px 12px', padding: '9px 11px', background: '#f6f8fa',
            border: `1px solid ${C.line}`, borderRadius: '8px',
            font: '11px/1.6 ui-monospace,Menlo,monospace', whiteSpace: 'pre', color: C.ghInk,
            overflowX: 'auto',
          }}
        >
          {note.code}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', padding: '0 14px 13px' }}>
        <button class="btn btn-primary" onClick={() => onAsk(note)}>💬 Ask about this</button>
        <button class="btn btn-ghost" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
