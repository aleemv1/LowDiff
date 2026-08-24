import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capMatches, containedPath, grepArgs, originAllowed, rgArgs, tokenMatches, truncateLine, SEARCH_CAPS } from '../src/lib.js';

describe('tokenMatches', () => {
  it('accepts the exact token', () => {
    expect(tokenMatches('abc123', 'abc123')).toBe(true);
  });
  it('rejects a wrong token, a prefix, and a missing header', () => {
    expect(tokenMatches('abc124', 'abc123')).toBe(false);
    expect(tokenMatches('abc', 'abc123')).toBe(false);
    expect(tokenMatches(undefined, 'abc123')).toBe(false);
  });
});

describe('originAllowed', () => {
  it('allows extension origins', () => {
    expect(originAllowed('chrome-extension://abcdef')).toBe(true);
  });
  it('allows no-origin callers like curl — the token still gates them', () => {
    expect(originAllowed(undefined)).toBe(true);
  });
  it('rejects web pages', () => {
    expect(originAllowed('https://evil.example')).toBe(false);
    expect(originAllowed('http://localhost:3000')).toBe(false);
  });
});

describe('containedPath', () => {
  const root = mkdtempSync(join(tmpdir(), 'lowdiff-contain-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'a.ts'), 'x');
  writeFileSync(join(tmpdir(), 'lowdiff-outside.txt'), 'secret');

  it('resolves a path inside the repo', () => {
    expect(containedPath(root, 'src/a.ts')).toContain('a.ts');
  });
  it('refuses ../ escape', () => {
    expect(containedPath(root, '../lowdiff-outside.txt')).toBeNull();
  });
  it('refuses an absolute path outside the repo', () => {
    expect(containedPath(root, '/etc/hosts')).toBeNull();
  });
  it('refuses a symlink pointing out of the repo', () => {
    symlinkSync(join(tmpdir(), 'lowdiff-outside.txt'), join(root, 'sneaky.txt'));
    expect(containedPath(root, 'sneaky.txt')).toBeNull();
  });
  it('returns null for a file that does not exist', () => {
    expect(containedPath(root, 'src/missing.ts')).toBeNull();
  });
});

describe('rgArgs', () => {
  it('searches fixed strings, not regexes', () => {
    expect(rgArgs('a(b', SEARCH_CAPS)).toContain('--fixed-strings');
  });
  it('terminates options before the query so a leading dash cannot inject flags', () => {
    const args = rgArgs('-rf /', SEARCH_CAPS);
    expect(args[args.indexOf('--') + 1]).toBe('-rf /');
  });
});

describe('capMatches', () => {
  it('passes small result sets through', () => {
    expect(capMatches(['a'], SEARCH_CAPS)).toEqual(['a']);
  });
  it('caps large sets and says how much was elided', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `m${i}`);
    const capped = capMatches(lines, SEARCH_CAPS);
    expect(capped).toHaveLength(SEARCH_CAPS.maxTotalMatches + 1);
    expect(capped.at(-1)).toContain('20 more');
  });
});

describe('grepArgs', () => {
  it('is fixed-string and excludes vendored directories', () => {
    const args = grepArgs('a(b', SEARCH_CAPS);
    expect(args).toContain('-F');
    expect(args).toContain('--exclude-dir=node_modules');
  });
  it('terminates options before the query', () => {
    const args = grepArgs('-rf /', SEARCH_CAPS);
    expect(args[args.indexOf('--') + 1]).toBe('-rf /');
  });
});

describe('truncateLine', () => {
  it('leaves short lines alone', () => {
    expect(truncateLine('short', SEARCH_CAPS)).toBe('short');
  });
  it('caps long lines', () => {
    const long = 'x'.repeat(500);
    expect(truncateLine(long, SEARCH_CAPS).length).toBe(SEARCH_CAPS.maxColumns + 1);
  });
});
