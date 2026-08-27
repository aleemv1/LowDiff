import type { Note } from '@lowdiff/core';
import { C, KIND_STYLE } from '../theme.js';
import { Markdown } from './Markdown.js';
import { CodeBlock } from './CodeBlock.js';

interface Props {
  note: Note;
  /** Positioned by the caller rather than relative to a diff row. */
  floating?: boolean;
  onClose: () => void;
  onAsk: (note: Note) => void;
}

/** Best-effort language for highlighting, from the file the note is on. */
function languageFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const byExt: Record<string, string> = {
    yml: 'yaml', yaml: 'yaml', json: 'json', sh: 'bash', bash: 'bash',
    py: 'python', ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  };
  return byExt[ext] ?? '';
}

export function NotePopover({ note, floating, onClose, onAsk }: Props) {
  const style = KIND_STYLE[note.kind]!;
  const placement = floating
    ? { position: 'static' as const, width: '100%', maxWidth: 'none' }
    : {
        position: 'absolute' as const,
        right: '42px',
        top: '100%',
        marginTop: '6px',
        width: '440px',
        maxWidth: 'calc(100% - 60px)',
      };

  return (
    <div
      style={{
        ...placement,
        zIndex: 40, background: C.surface,
        border: `1px solid ${C.line}`, borderRadius: '12px',
        boxShadow: '0 12px 32px rgba(0,0,0,.28)', animation: 'notePop .14s ease-out',
        whiteSpace: 'normal', overflow: 'hidden', textAlign: 'left',
        // The popover portals into the document.body shadow host, where
        // `all: initial` applies and nothing inherits a face — without this
        // the note body rendered in the browser's serif fallback.
        fontFamily: `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`,
      }}
    >
      {/* flex-start: a wrapped title must not float the pill and ✕ mid-height. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', padding: '11px 14px', background: style.headBg }}>
        <span
          style={{
            background: '#fff', color: style.color, borderRadius: '999px', padding: '3px 10px',
            font: `700 10px 'DM Sans',sans-serif`, letterSpacing: '.03em',
          }}
        >
          {note.kind}
        </span>
        <span style={{ font: `700 12.5px/1.4 'DM Sans',sans-serif`, color: C.ink, marginTop: '2px' }}>
          {note.title}
        </span>
        <span
          onClick={onClose}
          style={{ marginLeft: 'auto', cursor: 'pointer', color: C.faint, fontSize: '13px', padding: '2px 6px', flex: 'none' }}
        >
          ✕
        </span>
      </div>

      {/* Where this note lives, and how far to trust it, in plain words. */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 14px',
          borderBottom: `1px solid ${C.line}`,
          font: '11px ui-monospace, SFMono-Regular, Menlo, monospace', color: C.faint,
        }}
      >
        {note.anchor.path.split('/').pop()}:{note.anchor.line}
        {note.confidence === 'medium' && (
          <span style={{ marginLeft: 'auto', font: `500 10.5px 'DM Sans',sans-serif`, color: C.muted }}>
            ⚠ depends on code not in this diff
          </span>
        )}
      </div>

      <div style={{ padding: '12px 14px', color: C.body }}>
        <Markdown text={note.body} font="12.5px/1.6 inherit" />
      </div>

      {note.code && (
        <div style={{ padding: '0 14px' }}>
          <CodeBlock code={note.code} lang={languageFor(note.anchor.path)} role="SUGGESTED FIX" />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', padding: '0 14px 13px' }}>
        <button class="btn btn-primary" onClick={() => onAsk(note)}>💬 Ask about this</button>
      </div>
    </div>
  );
}
