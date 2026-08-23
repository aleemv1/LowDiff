import type { DiffLine, Hunk } from './types.js';

/** `@@ -24,5 +24,6 @@ trailing context` */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse the unified-diff `patch` string GitHub returns for a file into hunks
 * with resolved left/right line numbers.
 *
 * Line numbers are what notes anchor to, so getting them right matters more
 * than anything else here: an off-by-one puts a note on the wrong line, which
 * reads as a hallucination even when the note itself is correct.
 */
export function parsePatch(patch: string): Hunk[] {
  if (!patch.trim()) return [];

  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  let left = 0;
  let right = 0;

  for (const rawLine of patch.split('\n')) {
    const header = HUNK_HEADER.exec(rawLine);
    if (header) {
      current = { header: rawLine, lines: [] };
      hunks.push(current);
      left = Number(header[1]);
      right = Number(header[3]);
      continue;
    }

    if (!current) continue;
    // "\ No newline at end of file" annotates the previous line; it is not one.
    if (rawLine.startsWith('\\')) continue;

    const marker = rawLine[0];
    const text = rawLine.slice(1);

    let line: DiffLine;
    if (marker === '+') {
      line = { type: 'add', leftLine: null, rightLine: right++, text };
    } else if (marker === '-') {
      line = { type: 'del', leftLine: left++, rightLine: null, text };
    } else if (marker === ' ') {
      line = { type: 'ctx', leftLine: left++, rightLine: right++, text };
    } else {
      // Trailing blank line from the split, or something we don't model.
      continue;
    }
    current.lines.push(line);
  }

  return hunks;
}
