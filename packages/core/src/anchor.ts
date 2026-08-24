import type { Anchor, DiffLine, FileDiff, Note, NoteKind, RawNote } from './types.js';

/**
 * Severity order, most severe first. Used to pick a winner when the model puts
 * more than one note on the same line — the overlay only has room for one badge.
 */
const SEVERITY: readonly NoteKind[] = [
  'SECURITY',
  'RISK',
  'BREAKING',
  'PERF',
  'SUGGESTION',
  'EXPLAIN',
];

/**
 * Stable, dependency-free hash of a line's text (FNV-1a, 32-bit, hex).
 *
 * This does not need to be cryptographic — it only needs to be stable across
 * runs and cheap enough to compute for every line of every diff.
 */
export function hashLine(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function findLine(
  diff: readonly FileDiff[],
  path: string,
  side: 'LEFT' | 'RIGHT',
  line: number,
): DiffLine | null {
  const file = diff.find((f) => f.path === path);
  if (!file) return null;
  for (const hunk of file.hunks) {
    for (const l of hunk.lines) {
      const n = side === 'LEFT' ? l.leftLine : l.rightLine;
      if (n === line) return l;
    }
  }
  return null;
}

function keyOf(a: Anchor): string {
  return `${a.path}:${a.side}:${a.line}`;
}

function moreSevere(a: NoteKind, b: NoteKind): boolean {
  return SEVERITY.indexOf(a) < SEVERITY.indexOf(b);
}

/** Collapse to one note per anchored line, keeping the most severe. */
function dedupeByLine(notes: readonly Note[]): Note[] {
  const best = new Map<string, Note>();
  for (const note of notes) {
    const key = keyOf(note.anchor);
    const existing = best.get(key);
    if (!existing || moreSevere(note.kind, existing.kind)) best.set(key, note);
  }
  return [...best.values()];
}

/**
 * Ground the model's raw notes against the diff it was shown.
 *
 * A note that points at a file or line that isn't in the diff is dropped, not
 * repaired. The model occasionally invents a plausible-looking location, and a
 * note rendered against the wrong line is worse than no note at all.
 */
export function anchorNotes(raw: readonly RawNote[], diff: readonly FileDiff[]): Note[] {
  const anchored: Note[] = [];

  for (const note of raw) {
    const line = findLine(diff, note.path, note.side, note.line);
    if (!line) continue;

    anchored.push({
      kind: note.kind,
      title: note.title,
      body: note.body,
      ...(note.code !== undefined ? { code: note.code } : {}),
      confidence: note.confidence,
      anchor: {
        path: note.path,
        side: note.side,
        line: note.line,
        // A range that ends before it starts is meaningless; drop it rather
        // than highlighting backwards.
        ...(note.endLine !== undefined && note.endLine > note.line
          ? { endLine: note.endLine }
          : {}),
        lineHash: hashLine(line.text),
      },
    });
  }

  return dedupeByLine(anchored);
}

/**
 * Re-home cached notes onto a new head SHA's diff.
 *
 * Matching is by line hash rather than line number, so a note follows its line
 * when a later commit shifts it. A note whose line is gone is dropped — we'd
 * rather lose a note than show it against code it wasn't written about.
 */
export function reanchor(notes: readonly Note[], diff: readonly FileDiff[]): Note[] {
  const moved: Note[] = [];

  for (const note of notes) {
    const file = diff.find((f) => f.path === note.anchor.path);
    if (!file) continue;

    let found: number | null = null;
    for (const hunk of file.hunks) {
      for (const l of hunk.lines) {
        const n = note.anchor.side === 'LEFT' ? l.leftLine : l.rightLine;
        if (n !== null && hashLine(l.text) === note.anchor.lineHash) {
          found = n;
          break;
        }
      }
      if (found !== null) break;
    }
    if (found === null) continue;

    moved.push({ ...note, anchor: { ...note.anchor, line: found } });
  }

  return dedupeByLine(moved);
}
