import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';

const root = import.meta.dirname;

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    rollupOptions: {
      input: {
        background: resolve(root, 'src/background/index.ts'),
        content: resolve(root, 'src/content/index.tsx'),
        options: resolve(root, 'src/options/index.tsx'),
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
      name: 'lowdiff-manifest',
      closeBundle() {
        mkdirSync(resolve(root, 'dist'), { recursive: true });
        copyFileSync(resolve(root, 'manifest.json'), resolve(root, 'dist/manifest.json'));
        copyFileSync(resolve(root, 'src/options/options.html'), resolve(root, 'dist/options.html'));
        cpSync(resolve(root, 'public/icons'), resolve(root, 'dist/icons'), { recursive: true });
        copyFileSync(resolve(root, 'src/dev/dev.html'), resolve(root, 'dist/dev.html'));
      },
    },
  ],
});
