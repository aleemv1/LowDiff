import { describe, it, expect } from 'vitest';
import { renderDiff, systemPrompt, userPrompt } from '../src/prompts.js';
import { parsePatch } from '../src/parse-patch.js';
import type { FileDiff } from '../src/types.js';

const files: FileDiff[] = [
  {
    path: 'src/a.ts',
    status: 'modified',
    additions: 2,
    deletions: 1,
    hunks: parsePatch('@@ -24,2 +24,3 @@\n ctx line\n-gone\n+added'),
  },
];

describe('renderDiff', () => {
  it('shows both line numbers so notes can cite either side', () => {
    const out = renderDiff(files);
    expect(out).toContain('   24    24  ctx line');
    expect(out).toContain('   25       -gone');
    expect(out).toContain('         25 +added');
  });

  it('labels the file with its path and status', () => {
    expect(renderDiff(files)).toContain('--- FILE: src/a.ts (modified, +2 -1)');
  });
});

describe('systemPrompt', () => {
  it('covers problems and explanation in one pass', () => {
    const p = systemPrompt();
    expect(p).toContain('RISK:');
    expect(p).toContain('EXPLAIN:');
    expect(p).toContain('SUGGESTION:');
  });

  it('keeps the problems-only bar: none found is a valid outcome', () => {
    expect(systemPrompt()).toMatch(/that is correct/);
  });

  it('still prices a false alarm above a missed nit', () => {
    expect(systemPrompt()).toMatch(/false alarm costs more/);
  });

  it('wants identifiers in backticks, in the summary too', () => {
    expect(systemPrompt()).toMatch(/backticks everywhere, the summary included/);
  });

  it('forbids citing unseen lines', () => {
    expect(systemPrompt()).toMatch(/Never cite a line you were not shown/);
  });
});

describe('userPrompt', () => {
  it('includes the PR title and description', () => {
    const p = userPrompt(files, 'fix: debounce', 'Fixes #398');
    expect(p).toContain('PR title: fix: debounce');
    expect(p).toContain('Fixes #398');
  });

  it('marks an empty description rather than leaving a blank', () => {
    expect(userPrompt(files, 't', '   ')).toContain('(no description)');
  });
});
