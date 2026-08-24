import { timingSafeEqual } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

/**
 * Pure logic for the daemon, kept apart from the HTTP server so the parts
 * that guard repo access are unit-testable.
 */

export interface RepoRegistry {
  /** name -> absolute root path */
  [name: string]: string;
}

/** Constant-time token comparison; a plain === leaks length via timing. */
export function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Only the extension may call the daemon from a browser context.
 *
 * Web pages always send an Origin on cross-origin requests, so rejecting
 * non-extension origins closes the "any website can hit localhost" hole.
 * Requests without an Origin (curl, the CLI) still need the token.
 */
export function originAllowed(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  return origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://');
}

/**
 * Resolve a path inside a registered repo, refusing anything that escapes it.
 *
 * The containment check runs on the *resolved* path, so `../` tricks and
 * symlinks pointing outside the repo are both caught.
 */
export function containedPath(root: string, relative: string): string | null {
  const rootReal = realpathSync(root);
  const candidate = resolve(rootReal, relative);

  let real: string;
  try {
    real = realpathSync(candidate);
  } catch {
    return null; // does not exist
  }

  if (real !== rootReal && !real.startsWith(rootReal + sep)) return null;
  return real;
}

export interface SearchCaps {
  maxMatchesPerFile: number;
  maxTotalMatches: number;
  maxColumns: number;
}

export const SEARCH_CAPS: SearchCaps = {
  maxMatchesPerFile: 5,
  maxTotalMatches: 30,
  maxColumns: 200,
};

/**
 * ripgrep invocation. Fixed-string search (-F): the query comes from a model,
 * and a regex that happens to be pathological should not hang the daemon.
 */
export function rgArgs(query: string, caps: SearchCaps): string[] {
  return [
    '--no-heading',
    '--line-number',
    '--smart-case',
    '--fixed-strings',
    '--max-count', String(caps.maxMatchesPerFile),
    '--max-columns', String(caps.maxColumns),
    '--hidden',
    '--glob', '!.git',
    '--', query,
  ];
}

/**
 * Fallback for machines without a ripgrep binary — `rg` is often a shell
 * alias or function, which child_process cannot see. BSD and GNU grep both
 * accept these flags.
 */
export function grepArgs(query: string, caps: SearchCaps): string[] {
  return [
    '-r',                 // recurse
    '-n',                 // line numbers
    '-I',                 // skip binary files
    '-i',                 // grep has no smart case; match rg's forgiving default
    '-F',                 // fixed strings, same reasoning as rg
    '--exclude-dir=.git',
    '--exclude-dir=node_modules',
    '--exclude-dir=dist',
    '-m', String(caps.maxMatchesPerFile),
    '--', query,
  ];
}

/** grep has no --max-columns; enforce the cap ourselves. */
export function truncateLine(line: string, caps: SearchCaps): string {
  return line.length > caps.maxColumns ? line.slice(0, caps.maxColumns) + '…' : line;
}

/** Trim rg output to the total cap, marking elision so the model knows. */
export function capMatches(lines: string[], caps: SearchCaps): string[] {
  if (lines.length <= caps.maxTotalMatches) return lines;
  return [
    ...lines.slice(0, caps.maxTotalMatches),
    `[${lines.length - caps.maxTotalMatches} more matches not shown — narrow the query]`,
  ];
}
