/**
 * Renders the overlay against fixture data with `chrome.*` stubbed, so the UI
 * can be iterated on in a normal browser tab without packing and loading the
 * extension. Not shipped in the extension bundle's runtime path.
 */
import { render } from 'preact';
import { parsePatch } from '@lowdiff/core';
import type { FileDiff, Note } from '@lowdiff/core';
import { Overlay } from '../content/Overlay.js';
import { STYLES } from '../content/theme.js';
import { anchorNotes } from '@lowdiff/core';

const files: FileDiff[] = [
  {
    path: 'src/search/useSearch.ts',
    status: 'modified',
    additions: 18,
    deletions: 7,
    hunks: parsePatch(
      [
        '@@ -24,5 +24,7 @@ export function useSearch',
        ' export function useSearch(query: string) {',
        '-  const results = fetchResults(query);',
        '+  const debounced = useDebounce(query, 300);',
        '+  const results = fetchResults(debounced);',
        '   return useMemo(() => ({',
        '+    results: results ?? [],',
        ' }',
      ].join('\n'),
    ),
  },
  {
    path: 'src/api/client.ts',
    status: 'modified',
    additions: 6,
    deletions: 4,
    hunks: parsePatch(
      [
        '@@ -58,4 +58,5 @@ export async function search',
        ' export async function search(',
        '-  term: string, cacheKey?: string,',
        '+  term: string,',
        ' ): Promise<SearchResult[]> {',
      ].join('\n'),
    ),
  },
];

const notes: Note[] = anchorNotes(
  [
    {
      kind: 'RISK',
      title: 'In-flight requests are not cancelled',
      body: 'Debounce delays the fetch but does not abort earlier ones — a slow early response can overwrite a fast later one, showing stale results.',
      code: 'const ctrl = new AbortController();\nfetchResults(debounced, { signal: ctrl.signal });\nreturn () => ctrl.abort();',
      path: 'src/search/useSearch.ts',
      side: 'RIGHT',
      line: 26,
      confidence: 'high',
    },
    {
      kind: 'BREAKING',
      title: 'Public parameter removed',
      body: 'search() is exported from the package root. Removing cacheKey breaks external callers — deprecate first or bump major.',
      path: 'src/api/client.ts',
      side: 'RIGHT',
      line: 59,
      confidence: 'medium',
    },
  ],
  files,
);

// Minimal chrome stub — enough for the overlay's message round-trips.
const memory = new Map<string, unknown>();

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (key: string | null) =>
        key === null
          ? Object.fromEntries(memory)
          : { [key]: memory.get(key) },
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) memory.set(k, v);
      },
      remove: async (keys: string[]) => {
        for (const k of keys) memory.delete(k);
      },
    },
  },
  runtime: {
    sendMessage: async (message: { type: string }) => {
      if (message.type === 'GET_PUBLIC_SETTINGS') {
        return {
          ok: true,
          settings: { provider: 'anthropic', configured: true, deepAvailable: false },
        };
      }
      if (message.type === 'ANNOTATE') {
        await new Promise((r) => setTimeout(r, 400));
        return {
          ok: true,
          summary:
            'Replaces per-keystroke fetching with a 300ms debounce and fixes the stale dependency array from #398. One unresolved risk: in-flight requests are not cancelled.',
          notes,
          headSha: 'fixture',
          cached: false,
          usage: { inputTokens: 8000, outputTokens: 1200 },
        };
      }
      return { ok: true };
    },
    connect: () => ({
      onMessage: {
        addListener: (fn: (d: unknown) => void) => {
          // A realistic answer: prose, inline code, and two fenced alternatives.
          const reply = [
            'The `strategy` block contains only `max-parallel: 5` and no `matrix:` key,',
            'so `build-linux` expands to exactly one job. Capping concurrency at 5 over',
            'a set of size 1 is a no-op.',
            '',
            'Drop it:',
            '```yaml',
            '  build-linux:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '      ...',
            '```',
            '',
            'Or make it meaningful:',
            '```yaml',
            '    strategy:',
            '      max-parallel: 5',
            '      matrix:',
            "        python-version: ['3.10', '3.11', '3.12']",
            '```',
            '',
            'Note that a matrix also needs `${{ matrix.python-version }}` wired into the',
            'setup step.',
          ].join('\n');

          const chunks = reply.match(/[\s\S]{1,24}/g) ?? [];
          let i = 0;
          const timer = setInterval(() => {
            if (i >= chunks.length) {
              clearInterval(timer);
              fn({ type: 'done' });
              return;
            }
            fn({ type: 'text', text: chunks[i++] });
          }, 25);
        },
      },
      disconnect: () => {},
    }),
  },
};

const style = document.createElement('style');
style.textContent = STYLES.replaceAll(':host', ':root');
document.head.append(style);

const overlayRoot = document.createElement('div');
document.body.append(overlayRoot);

render(
  <Overlay pr={{ owner: 'acme', repo: 'search-api', number: 412 }} overlayRoot={overlayRoot} />,
  document.getElementById('root')!,
);
