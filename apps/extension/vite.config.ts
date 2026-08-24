import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';
import { BUILD_ID, jsx } from './vite.shared.js';

const root = import.meta.dirname;

/** Extension pages. These are real documents, so chunking is fine here. */
export default defineConfig({
  esbuild: jsx,
  define: { __LOWDIFF_BUILD__: JSON.stringify(BUILD_ID) },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    rollupOptions: {
      input: {
        options: resolve(root, 'src/options/index.tsx'),
        popup: resolve(root, 'src/popup/index.tsx'),
        dev: resolve(root, 'src/dev/index.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  plugins: [
    {
      name: 'lowdiff-static',
      closeBundle() {
        mkdirSync(resolve(root, 'dist'), { recursive: true });
        copyFileSync(resolve(root, 'manifest.json'), resolve(root, 'dist/manifest.json'));
        copyFileSync(resolve(root, 'src/options/options.html'), resolve(root, 'dist/options.html'));
        copyFileSync(resolve(root, 'src/popup/popup.html'), resolve(root, 'dist/popup.html'));
        copyFileSync(resolve(root, 'src/dev/dev.html'), resolve(root, 'dist/dev.html'));
        cpSync(resolve(root, 'public/icons'), resolve(root, 'dist/icons'), { recursive: true });
      },
    },
  ],
});
