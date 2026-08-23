import { describe, it, expect } from 'vitest';
import { anchorNotes, reanchor, hashLine } from '../src/anchor.js';
import { parsePatch } from '../src/parse-patch.js';
import type { FileDiff, Note, RawNote } from '../src/types.js';

const file = (path: string, patch: string): FileDiff => ({
  path,
  status: 'modified',
  additions: 0,
  deletions: 0,
  hunks: parsePatch(patch),
});

const DIFF = [
  file(
    'src/search/useSearch.ts',
    [
      '@@ -24,3 +24,4 @@',
      ' export function useSearch(query: string) {',
      '-  const results = fetchResults(query);',
      '+  const debounced = useDebounce(query, 300);',
      '+  const results = fetchResults(debounced);',
    ].join('\n'),
  ),
];

const raw = (over: Partial<RawNote> = {}): RawNote => ({
  kind: 'RISK',
  title: 'In-flight requests are not cancelled',
  body: 'Debounce delays the fetch but does not abort earlier ones.',
  path: 'src/search/useSearch.ts',
  side: 'RIGHT',
  line: 26,
  confidence: 'high',
  ...over,
});

describe('anchorNotes', () => {
  it('anchors a note that points at a real line in the diff', () => {
    const notes = anchorNotes([raw()], DIFF);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.anchor.line).toBe(26);
    expect(notes[0]!.anchor.lineHash).toBe(
      hashLine('  const results = fetchResults(debounced);'),
    );
  });

  it('drops a note pointing at a file that is not in the diff', () => {
    expect(anchorNotes([raw({ path: 'src/nope.ts' })], DIFF)).toEqual([]);
  });

  it('drops a note pointing at a line outside the diff', () => {
    expect(anchorNotes([raw({ line: 9999 })], DIFF)).toEqual([]);
  });

  it('drops a note whose side has no such line', () => {
    // line 26 exists on the RIGHT side only
    expect(anchorNotes([raw({ side: 'LEFT', line: 26 })], DIFF)).toEqual([]);
  });

  it('anchors deleted lines on the LEFT side', () => {
    const notes = anchorNotes([raw({ side: 'LEFT', line: 25 })], DIFF);
    expect(notes[0]!.anchor.lineHash).toBe(
      hashLine('  const results = fetchResults(query);'),
    );
  });

  it('keeps at most one note per line, preferring the higher severity', () => {
    const notes = anchorNotes([raw({ kind: 'EXPLAIN' }), raw({ kind: 'SECURITY' })], DIFF);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.kind).toBe('SECURITY');
  });
});

describe('reanchor', () => {
  const anchored: Note[] = anchorNotes([raw()], DIFF);

  it('follows the line when a force-push shifts it', () => {
    const shifted = [
      file(
        'src/search/useSearch.ts',
        [
          '@@ -24,3 +24,5 @@',
          ' export function useSearch(query: string) {',
          '+  // added a comment above',
          '-  const results = fetchResults(query);',
          '+  const debounced = useDebounce(query, 300);',
          '+  const results = fetchResults(debounced);',
        ].join('\n'),
      ),
    ];
    const moved = reanchor(anchored, shifted);
    expect(moved).toHaveLength(1);
    expect(moved[0]!.anchor.line).toBe(27);
  });

  it('drops a note whose line no longer exists', () => {
    const gone = [file('src/search/useSearch.ts', '@@ -24,1 +24,1 @@\n ok')];
    expect(reanchor(anchored, gone)).toEqual([]);
  });

  it('drops a note whose file was removed from the PR', () => {
    expect(reanchor(anchored, [])).toEqual([]);
  });
});
