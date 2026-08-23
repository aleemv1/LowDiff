import { describe, it, expect } from 'vitest';
import { parsePrUrl } from '../src/parse-url.js';

describe('parsePrUrl', () => {
  it('parses the files-changed tab', () => {
    expect(parsePrUrl('https://github.com/acme/search-api/pull/412/files')).toEqual({
      owner: 'acme',
      repo: 'search-api',
      number: 412,
    });
  });

  it('parses the bare PR url', () => {
    expect(parsePrUrl('https://github.com/acme/search-api/pull/412')).toEqual({
      owner: 'acme',
      repo: 'search-api',
      number: 412,
    });
  });

  it('ignores query strings and fragments', () => {
    expect(parsePrUrl('https://github.com/a/b/pull/7/files?w=1#diff-abc')?.number).toBe(7);
  });

  it('returns null for a non-PR GitHub page', () => {
    expect(parsePrUrl('https://github.com/acme/search-api/issues/412')).toBeNull();
  });

  it('returns null for the repo root', () => {
    expect(parsePrUrl('https://github.com/acme/search-api')).toBeNull();
  });

  it('returns null for a non-GitHub host', () => {
    expect(parsePrUrl('https://gitlab.com/acme/x/pull/1')).toBeNull();
  });

  it('returns null for a lookalike host', () => {
    expect(parsePrUrl('https://github.com.evil.test/a/b/pull/1')).toBeNull();
  });

  it('returns null for garbage', () => {
    expect(parsePrUrl('not a url')).toBeNull();
  });
});
