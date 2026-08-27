import { describe, expect, it } from 'vitest';
import { resolveImports } from '../src/imports.js';

const tree = new Set([
  'src/content/annotate.ts',
  'src/content/theme.ts',
  'src/content/dom/index.ts',
  'src/shared/messages.ts',
  'hooks/patterns.py',
  'hooks/util/__init__.py',
  'hooks/extensibility.py',
]);

describe('resolveImports', () => {
  it('resolves relative JS imports against the repo tree', () => {
    const content = "import { glowFor } from './theme.js';\nimport type { DiffDom } from './dom/index.js';";
    expect(resolveImports('src/content/annotate.ts', content, tree)).toEqual([
      'src/content/theme.ts',
      'src/content/dom/index.ts',
    ]);
  });

  it('resolves ../ imports', () => {
    const content = "import type { Reply } from '../shared/messages.js';";
    expect(resolveImports('src/content/annotate.ts', content, tree)).toEqual([
      'src/shared/messages.ts',
    ]);
  });

  it('ignores package imports — they are not repo files', () => {
    const content = "import { render } from 'preact';\nimport Prism from 'prismjs';";
    expect(resolveImports('src/content/annotate.ts', content, tree)).toEqual([]);
  });

  it('resolves python module imports', () => {
    const content = 'from hooks.patterns import RULES\nimport hooks.util';
    expect(resolveImports('hooks/extensibility.py', content, tree)).toEqual([
      'hooks/patterns.py',
      'hooks/util/__init__.py',
    ]);
  });

  it('never resolves a file to itself', () => {
    const content = "import { x } from './annotate.js';";
    expect(resolveImports('src/content/annotate.ts', content, tree)).toEqual([]);
  });
});
