import type { UserConfig } from 'vite';

/** Stamped into the bundle so a stale, unreloaded extension is obvious. */
export const BUILD_ID = process.env['LOWDIFF_BUILD'] ?? 'dev';

export const jsx = { jsx: 'automatic', jsxImportSource: 'preact' } as const;

/**
 * Both the service worker and the content script must be single self-contained
 * files. Vite's chunk loader injects a <link rel=modulepreload> into
 * document.head, and neither context has a document — the worker throws
 * "document is not defined", and content scripts cannot load chunks at all.
 */
export function singleFile(entry: string, fileName: string, format: 'es' | 'iife'): UserConfig {
  return {
    esbuild: jsx,
    define: { __LOWDIFF_BUILD__: JSON.stringify(BUILD_ID) },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      target: 'chrome116',
      modulePreload: false,
      rollupOptions: {
        input: entry,
        output: { format, entryFileNames: fileName, inlineDynamicImports: true },
      },
    },
  };
}
