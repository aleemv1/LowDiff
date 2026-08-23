import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { singleFile } from './vite.shared.js';

export default defineConfig(
  singleFile(resolve(import.meta.dirname, 'src/background/index.ts'), 'background.js', 'es'),
);
