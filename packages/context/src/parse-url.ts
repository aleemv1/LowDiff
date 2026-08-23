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
