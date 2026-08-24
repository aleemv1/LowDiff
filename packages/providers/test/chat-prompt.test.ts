import { describe, it, expect } from 'vitest';
import { parsePatch } from '@lowdiff/core';
import type { FileDiff, Note } from '@lowdiff/core';
import { MAX_DIFF_CHARS, chatSystemPrompt, chatUserPrompt } from '../src/chat-prompt.js';
import type { ChatRequest } from '../src/types.js';

const files: FileDiff[] = [
  {
    path: 'src/search/useSearch.ts',
    status: 'modified',
    additions: 2,
    deletions: 1,
    hunks: parsePatch('@@ -24,2 +24,3 @@\n ctx\n-const a = 1;\n+const debounced = useDebounce(query, 300);'),
  },
];

const notes: Note[] = [
  {
    kind: 'RISK',
    title: 'In-flight requests are not cancelled',
    body: 'Debounce delays the fetch but does not abort earlier ones.',
    confidence: 'high',
    anchor: { path: 'src/search/useSearch.ts', side: 'RIGHT', line: 26, lineHash: 'h' },
  },
];

function request(over: Partial<ChatRequest> = {}): ChatRequest {
  return {
    pr: { owner: 'acme', repo: 'search-api', number: 412, headSha: 'abc' },
    title: 'fix: debounce search requests',
    body: 'Fixes #398.',
    files,
    summary: 'Replaces per-keystroke fetching with a 300ms debounce.',
    notes,
    history: [],
    question: 'Why 300ms?',
    ...over,
  };
}

describe('chatSystemPrompt', () => {
  const prompt = chatSystemPrompt(request());

  it('identifies the pull request', () => {
    expect(prompt).toContain('acme/search-api#412');
    expect(prompt).toContain('fix: debounce search requests');
  });

  it('includes the PR description', () => {
    expect(prompt).toContain('Fixes #398.');
  });

  it('marks an empty description rather than leaving a gap', () => {
    expect(chatSystemPrompt(request({ body: '  ' }))).toContain('(no description)');
  });

  it('includes the review summary', () => {
    expect(prompt).toContain('300ms debounce');
  });

  it('includes each finding with its kind and location', () => {
    expect(prompt).toContain('[RISK] src/search/useSearch.ts:26');
    expect(prompt).toContain('In-flight requests are not cancelled');
  });

  it('includes the finding body, so follow-up questions have the detail', () => {
    expect(prompt).toContain('does not abort earlier ones');
  });

  it('says so explicitly when there were no findings', () => {
    expect(chatSystemPrompt(request({ notes: [] }))).toContain('No findings were reported');
  });

  it('includes the diff with line numbers', () => {
    expect(prompt).toContain('const debounced = useDebounce(query, 300);');
    expect(prompt).toContain('--- FILE: src/search/useSearch.ts');
  });

  it('does not contain the question — that is the user turn', () => {
    expect(prompt).not.toContain('Why 300ms?');
  });

  it('is stable across turns so it can be cached', () => {
    const first = chatSystemPrompt(request({ question: 'a' }));
    const second = chatSystemPrompt(request({ question: 'b', history: [{ role: 'user', content: 'a' }] }));
    expect(first).toBe(second);
  });
});

describe('chatSystemPrompt truncation', () => {
  const huge: FileDiff[] = [
    {
      path: 'big.ts',
      status: 'modified',
      additions: 0,
      deletions: 0,
      hunks: parsePatch(
        '@@ -1,1 +1,1 @@\n' + Array.from({ length: 20000 }, (_, i) => `+line ${i} padding padding`).join('\n'),
      ),
    },
  ];

  it('caps an enormous diff', () => {
    const prompt = chatSystemPrompt(request({ files: huge }));
    expect(prompt.length).toBeLessThan(MAX_DIFF_CHARS + 5000);
  });

  it('tells the model it was truncated rather than truncating silently', () => {
    expect(chatSystemPrompt(request({ files: huge }))).toContain('diff truncated');
  });

  it('does not claim truncation for a small diff', () => {
    expect(chatSystemPrompt(request())).not.toContain('diff truncated');
  });
});

describe('chatUserPrompt', () => {
  it('is the question alone', () => {
    expect(chatUserPrompt(request())).toBe('Why 300ms?');
  });
});
