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
  it('tells review mode that zero notes is a valid outcome', () => {
    expect(systemPrompt('review')).toMatch(/zero notes/);
  });

  it('restricts review mode to the three problem kinds', () => {
    const p = systemPrompt('review');
    expect(p).toContain('RISK:');
    expect(p).not.toContain('SUGGESTION:');
  });

  it('offers all six kinds in explain mode', () => {
    const p = systemPrompt('explain');
    expect(p).toContain('EXPLAIN:');
    expect(p).toContain('SUGGESTION:');
  });

  it('forbids citing unseen lines in both modes', () => {
    for (const mode of ['review', 'explain'] as const) {
      expect(systemPrompt(mode)).toMatch(/Never cite a line you were not shown/);
    }
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
