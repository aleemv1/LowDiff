import type { FileDiff } from './types.js';

/**
 * Identifiers this diff defines or reshapes, for repo-wide lookups. Regex on
 * added lines, not a parser: the deep scan only needs grep queries, and a
 * missed symbol costs one lookup, not a review.
 */
export function symbolsFromDiff(files: readonly FileDiff[], max = 8): string[] {
  const patterns = [
    /\b(?:function|class|def|interface|struct|fn)\s+([A-Za-z_$][\w$]*)/,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/,
  ];

  const out = new Set<string>();
  for (const file of files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== 'add') continue;
        for (const pattern of patterns) {
          const match = pattern.exec(line.text);
          // Two-character names grep the world; skip them.
          if (match?.[1] && match[1].length >= 3) out.add(match[1]);
        }
      }
    }
  }
  return [...out].slice(0, max);
}
