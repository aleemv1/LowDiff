import type { Mode, Note } from '@lowdiff/core';

export interface CachedReview {
  summary: string;
  notes: Note[];
  headSha: string;
  usage: { inputTokens: number; outputTokens: number };
  storedAt: number;
}

/**
 * Bump the version whenever the prompts or note schema change. A cached
 * review outlives the prompt that produced it — without this, users keep
 * seeing old-style output for any PR whose head commit has not moved.
 */
const PREFIX = 'lowdiff:review:v4:';
const MAX_ENTRIES = 50;

function key(owner: string, repo: string, number: number, headSha: string, mode: Mode): string {
  return `${PREFIX}${owner}/${repo}#${number}@${headSha}:${mode}`;
}

/**
 * Reviews are cached on the head SHA, so navigating away and back is free and
 * a new commit is what invalidates — not a page reload.
 */
export async function readCache(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  mode: Mode,
): Promise<CachedReview | null> {
  const k = key(owner, repo, number, headSha, mode);
  const stored = await chrome.storage.local.get(k);
  return (stored[k] as CachedReview | undefined) ?? null;
}

export async function writeCache(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  mode: Mode,
  review: Omit<CachedReview, 'storedAt'>,
): Promise<void> {
  await chrome.storage.local.set({
    [key(owner, repo, number, headSha, mode)]: { ...review, storedAt: Date.now() },
  });
  await evictOldest();
}

/** Keep the cache bounded; extension storage is not unlimited. */
async function evictOldest(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([k]) => k.startsWith(PREFIX))
    .map(([k, v]) => ({ k, storedAt: (v as CachedReview).storedAt ?? 0 }));

  if (entries.length <= MAX_ENTRIES) return;

  entries.sort((a, b) => a.storedAt - b.storedAt);
  const stale = entries.slice(0, entries.length - MAX_ENTRIES).map((e) => e.k);
  await chrome.storage.local.remove(stale);
}
