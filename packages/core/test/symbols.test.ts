import { describe, expect, it } from 'vitest';
import { symbolsFromDiff } from '../src/symbols.js';
import { parsePatch } from '../src/parse-patch.js';
import type { FileDiff } from '../src/types.js';

function diff(patch: string): FileDiff[] {
  return [{ path: 'src/a.ts', status: 'modified', additions: 1, deletions: 0, hunks: parsePatch(patch) }];
}

describe('symbolsFromDiff', () => {
  it('collects identifiers the diff defines', () => {
    const files = diff(
      '@@ -1,1 +1,4 @@\n context\n+export function globToRegex(glob) {\n+class PatternSet {\n+def validate_pattern(entry):',
    );
    expect(symbolsFromDiff(files)).toEqual(['globToRegex', 'PatternSet', 'validate_pattern']);
  });

  it('ignores deleted and context lines', () => {
    const files = diff('@@ -1,2 +1,1 @@\n function keep() {\n-function gone() {');
    expect(symbolsFromDiff(files)).toEqual([]);
  });

  it('skips short names that would grep the world', () => {
    const files = diff('@@ -1,1 +1,1 @@\n+const on = 1;');
    expect(symbolsFromDiff(files)).toEqual([]);
  });

  it('caps how many symbols come back', () => {
    const patch = '@@ -1,1 +1,12 @@\n x\n' +
      Array.from({ length: 12 }, (_, i) => `+function name${String(i).padStart(2, '0')}() {}`).join('\n');
    expect(symbolsFromDiff(diff(patch))).toHaveLength(8);
  });
});
