/** A PR location parsed out of a github.com URL. */
export interface ParsedPrUrl {
  owner: string;
  repo: string;
  number: number;
}

const PR_PATH = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/;

/**
 * Extract the PR coordinates from a github.com URL.
 *
 * Returns null for anything that isn't a pull request page, including other
 * GitHub pages and non-GitHub hosts — the content script uses this to decide
 * whether to mount at all.
 */
export function parsePrUrl(url: string): ParsedPrUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'github.com') return null;

  const match = PR_PATH.exec(parsed.pathname);
  if (!match) return null;

  return {
    owner: match[1]!,
    repo: match[2]!,
    number: Number(match[3]!),
  };
}

/**
 * Whether a URL is the diff tab of a pull request.
 *
 * GitHub serves this as both `/files` (classic) and `/changes` (the newer
 * view), and rolls the rename out gradually — both are live, so both count.
 */
export function isPrDiffUrl(url: string): boolean {
  if (!parsePrUrl(url)) return false;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return /\/pull\/\d+\/(files|changes)(\/|$)/.test(path);
}
