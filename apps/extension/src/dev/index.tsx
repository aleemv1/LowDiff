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

// Optional fixture for checking overflow and focus deep in the jump list.
const previewNotes = new URLSearchParams(window.location.search).has('long-review')
  ? Array.from({ length: 20 }, (_, index): Note => ({
      ...notes[index % notes.length]!, kind: 'EXPLAIN',
      title: `Review detail ${index + 1}: ${notes[index % notes.length]!.title}`,
    }))
  : notes;

// Minimal chrome stub — enough for the overlay's message round-trips.
const memory = new Map<string, unknown>();

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    onChanged: { addListener: () => {}, removeListener: () => {} },
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
    id: 'lowdiff-dev-harness',
    sendMessage: async (message: { type: string }) => {
      if (message.type === 'GET_PUBLIC_SETTINGS') {
        return {
          ok: true,
          settings: { provider: 'anthropic', configured: true, hiddenKinds: [] },
        };
      }
      if (message.type === 'ANNOTATE') {
        await new Promise((r) => setTimeout(r, 400));
        return {
          ok: true,
          summary:
            'Replaces per-keystroke fetching with a 300ms debounce and fixes the stale dependency array from #398. One unresolved risk: in-flight requests are not cancelled.',
          notes: previewNotes,
          headSha: 'fixture',
          cached: false,
          usage: { inputTokens: 8000, outputTokens: 1200 },
        };
      }
      return { ok: true };
    },
    connect: () => {
      let timer: ReturnType<typeof setInterval> | undefined;
      return {
        onDisconnect: { addListener: () => {} },
        onMessage: {
          addListener: (fn: (d: unknown) => void) => {
            const reply = [
              'Debounce reduces how often a request starts. An earlier request can still finish last and overwrite newer results.',
              '',
              'Pass an `AbortSignal` to `fetchResults` and cancel during effect cleanup:',
              '```typescript',
              'const ctrl = new AbortController();',
              'fetchResults(debounced, { signal: ctrl.signal });',
              'return () => ctrl.abort();',
              '```',
              'Also check callers of `search()` before removing `cacheKey` from its public signature.',
            ].join('\n');
            const chunks = reply.match(/[\s\S]{1,24}/g) ?? [];
            let i = 0;
            timer = setInterval(() => {
              if (i >= chunks.length) {
                clearInterval(timer);
                fn({ type: 'done' });
                return;
              }
              fn({ type: 'text', text: chunks[i++] });
            }, 25);
          },
        },
        disconnect: () => clearInterval(timer),
      };
    },
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

// Preview-only controls. No live GitHub or model requests are made here.
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
});
