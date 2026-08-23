import { describe, it, expect } from 'vitest';
import { parsePatch } from '../src/parse-patch.js';

const PATCH = [
  '@@ -24,5 +24,6 @@ export function useSearch',
  ' export function useSearch(query: string) {',
  '-  const results = fetchResults(query);',
  '+  const debounced = useDebounce(query, 300);',
  '+  const results = fetchResults(debounced);',
  '   return useMemo(() => ({',
  ' }',
].join('\n');

describe('parsePatch', () => {
  it('reads the hunk header verbatim', () => {
    const hunks = parsePatch(PATCH);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.header).toBe('@@ -24,5 +24,6 @@ export function useSearch');
  });

  it('assigns left line numbers to context and deleted lines only', () => {
    const lines = parsePatch(PATCH)[0]!.lines;
    expect(lines.map((l) => l.leftLine)).toEqual([24, 25, null, null, 26, 27]);
  });

  it('assigns right line numbers to context and added lines only', () => {
    const lines = parsePatch(PATCH)[0]!.lines;
    expect(lines.map((l) => l.rightLine)).toEqual([24, null, 25, 26, 27, 28]);
  });

  it('strips the leading marker from line text', () => {
    const lines = parsePatch(PATCH)[0]!.lines;
    expect(lines[2]!.text).toBe('  const debounced = useDebounce(query, 300);');
    expect(lines[2]!.type).toBe('add');
  });

  it('handles multiple hunks', () => {
    const two = PATCH + '\n@@ -58,2 +59,2 @@ export async function search\n ok\n';
    expect(parsePatch(two)).toHaveLength(2);
  });

  it('handles single-line hunk headers that omit the count', () => {
    const hunks = parsePatch('@@ -1 +1 @@\n-a\n+b');
    expect(hunks[0]!.lines.map((l) => l.rightLine)).toEqual([null, 1]);
  });

  it('ignores the no-newline-at-eof marker', () => {
    const hunks = parsePatch('@@ -1,1 +1,1 @@\n-a\n\\ No newline at end of file\n+b');
    expect(hunks[0]!.lines.map((l) => l.text)).toEqual(['a', 'b']);
  });

  it('returns nothing for an empty patch', () => {
    expect(parsePatch('')).toEqual([]);
  });
});
