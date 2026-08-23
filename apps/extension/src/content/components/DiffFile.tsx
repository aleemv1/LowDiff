import type { DiffLine, FileDiff, Note } from '@lowdiff/core';
import { C } from '../theme.js';
import { NotePopover } from './NotePopover.js';

interface Props {
  file: FileDiff;
  notes: Note[];
  openNote: string | null;
  onToggle: (id: string) => void;
  onAsk: (note: Note) => void;
}

/** Stable identity for a rendered line, used to key the open-note state. */
export function lineId(path: string, line: DiffLine): string {
  const side = line.type === 'del' ? 'L' : 'R';
  const n = line.type === 'del' ? line.leftLine : line.rightLine;
  return `${path}:${side}${n}`;
}

function noteFor(notes: Note[], path: string, line: DiffLine): Note | undefined {
  return notes.find((note) => {
    if (note.anchor.path !== path) return false;
    const n = note.anchor.side === 'LEFT' ? line.leftLine : line.rightLine;
    return n !== null && n === note.anchor.line;
  });
}

export function DiffFileView({ file, notes, openNote, onToggle, onAsk }: Props) {
  const fileNotes = notes.filter((n) => n.anchor.path === file.path);

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: '10px', marginBottom: '18px', overflow: 'visible' }}>
      <div
        class="mono"
        style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px',
          background: '#f6f8fa', borderBottom: `1px solid ${C.line}`,
          borderRadius: '10px 10px 0 0', fontSize: '12px',
        }}
      >
        <span style={{ color: C.ghMuted }}>▾</span>
        <span style={{ fontWeight: 600, color: C.ghInk }}>{file.path}</span>
        <span style={{ color: '#1a7f37' }}>+{file.additions}</span>
        <span style={{ color: '#cf222e' }}>−{file.deletions}</span>
        {fileNotes.length > 0 && (
          <span
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '7px',
              background: '#faf9ff', border: `1px solid ${C.accentBorder}`, borderRadius: '999px',
              padding: '4px 12px', font: `11px/1.4 'DM Sans',sans-serif`, color: C.body,
            }}
          >
            <span style={{ color: C.accent, flex: 'none' }}>✦</span>
            {fileNotes.length} note{fileNotes.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/*
        No overflow on this container. Setting overflow-x alone makes the
        computed overflow-y `auto` too, which clips the absolutely positioned
        note popovers to the diff box. Long lines overflow instead.
      */}
      <div class="mono" style={{ font: '12px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace' }}>
        {file.hunks.map((hunk) => (
          <div key={hunk.header}>
            <div style={{ display: 'flex', background: '#ddf4ff', color: '#57606a', padding: '2px 0' }}>
              <span style={{ width: '84px', flex: 'none' }} />
              <span style={{ paddingLeft: '12px' }}>{hunk.header}</span>
            </div>

            {hunk.lines.map((line) => {
              const id = lineId(file.path, line);
              const note = noteFor(fileNotes, file.path, line);
              const active = openNote === id;
              const bg = line.type === 'add' ? C.addBg : line.type === 'del' ? C.delBg : C.surface;
              const numBg = line.type === 'add' ? C.addNum : line.type === 'del' ? C.delNum : C.surface;

              return (
                <div key={id} style={{ position: 'relative' }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'stretch',
                      boxShadow: active ? `inset 0 0 0 2px ${C.accent}` : 'none',
                    }}
                  >
                    <span style={{ width: '42px', flex: 'none', textAlign: 'right', paddingRight: '8px', color: C.ghMuted, background: active ? C.accentBorder : numBg }}>
                      {line.leftLine ?? ''}
                    </span>
                    <span style={{ width: '42px', flex: 'none', textAlign: 'right', paddingRight: '8px', color: C.ghMuted, background: active ? C.accentBorder : numBg }}>
                      {line.rightLine ?? ''}
                    </span>
                    <span style={{ flex: 1, whiteSpace: 'pre', paddingLeft: '12px', background: active ? C.accentSoft : bg, color: C.ghInk }}>
                      {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
                      {line.text}
                    </span>
                    <span style={{ width: '34px', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? C.accentSoft : bg }}>
                      {note && (
                        <span
                          class="badge"
                          title="Show AI note"
                          onClick={() => onToggle(id)}
                          style={{ background: active ? C.accent : '#fff', color: active ? '#fff' : C.accent }}
                        >
                          ✦
                        </span>
                      )}
                    </span>
                  </div>

                  {active && note && (
                    <NotePopover note={note} onClose={() => onToggle(id)} onAsk={onAsk} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
