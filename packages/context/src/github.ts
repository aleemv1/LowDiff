import { parsePatch, resolveImports } from '@lowdiff/core';
import type { ContextFile, FileDiff, PrRef, RepoRef } from '@lowdiff/core';
import type { CodeHit, ContextProvider, PrMeta } from './types.js';

const API = 'https://api.github.com';

export interface GitHubOptions {
  /** Fine-grained PAT. Optional: public repos work unauthenticated at 60 req/hr. */
  token?: string;
  fetchImpl?: typeof fetch;
  /** Attempts per request, including the first. */
  retries?: number;
  /** Injected in tests so backoff does not make them slow. */
  sleepImpl?: (ms: number) => Promise<void>;
}

interface GhFile {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

function toStatus(status: string): FileDiff['status'] {
  switch (status) {
    case 'added':
      return 'added';
    case 'removed':
      return 'removed';
    case 'renamed':
      return 'renamed';
    default:
      return 'modified';
  }
}

/**
 * Reads PRs through the GitHub REST API.
 *
 * Deliberately not DOM scraping: GitHub reships its diff view regularly and a
 * scraper breaks every time. The API costs a request but is stable.
 */
export class GitHubContextProvider implements ContextProvider {
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly retries: number;
  private readonly sleepImpl: (ms: number) => Promise<void>;

  constructor(options: GitHubOptions = {}) {
    this.token = options.token;
    // Bound to the global scope: stored as a plain instance property and
    // called as `this.fetchImpl(...)`, the real fetch receives the provider
    // as its `this` and throws "Illegal invocation".
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.retries = options.retries ?? 3;
    this.sleepImpl =
      options.sleepImpl ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  }

  private async request<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    // GitHub returns 502/503/504 intermittently on healthy requests. Retrying
    // is the difference between a working review and an error in the card.
    let response!: Response;
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      response = await this.fetchImpl(`${API}${path}`, { headers });
      if (response.status < 500 || attempt === this.retries) break;
      await this.sleepImpl(250 * 2 ** (attempt - 1));
    }

    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        throw new Error(
          this.token
            ? 'GitHub rate limit exhausted. Wait for the window to reset.'
            : 'GitHub rate limit exhausted. Add a personal access token to raise the limit from 60 to 5,000 requests per hour.',
        );
      }
    }
    if (response.status === 404) {
      throw new Error(
        this.token
          ? `Not found: ${path}. The token may lack access to this repository.`
          : `Not found: ${path}. Private repositories require a personal access token.`,
      );
    }
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status} for ${path}`);
    }

    return (await response.json()) as T;
  }

  async getPr(pr: Omit<PrRef, 'headSha'>): Promise<PrMeta> {
    const data = await this.request<{
      title: string;
      body: string | null;
      head: { sha: string };
    }>(`/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`);

    return { title: data.title, body: data.body ?? '', headSha: data.head.sha };
  }

  async getDiff(pr: PrRef): Promise<FileDiff[]> {
    const files: FileDiff[] = [];

    // The endpoint pages at 100; PRs larger than 300 files are truncated below.
    for (let page = 1; page <= 3; page++) {
      const batch = await this.request<GhFile[]>(
        `/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/files?per_page=100&page=${page}`,
      );

      for (const file of batch) {
        files.push({
          path: file.filename,
          ...(file.previous_filename ? { previousPath: file.previous_filename } : {}),
          status: toStatus(file.status),
          additions: file.additions,
          deletions: file.deletions,
          // Binary files and very large diffs come back with no patch.
          hunks: file.patch ? parsePatch(file.patch) : [],
        });
      }

      if (batch.length < 100) break;
    }

    return files;
  }

  async searchCode(query: string, repos: RepoRef[]): Promise<CodeHit[]> {
    if (repos.length === 0) return [];

    const scope = repos.map((r) => `repo:${r.owner}/${r.repo}`).join(' ');
    const data = await this.request<{
      items: { path: string; repository: { owner: { login: string }; name: string } }[];
    }>(`/search/code?q=${encodeURIComponent(`${query} ${scope}`)}&per_page=20`);

    // Code search returns file matches without line numbers; the daemon in v2
    // is what makes this precise. Line 1 is a placeholder, not a real hit.
    return data.items.map((item) => ({
      repo: { owner: item.repository.owner.login, repo: item.repository.name },
      path: item.path,
      line: 1,
      text: '',
    }));
  }

  /**
   * Full contents of the changed files at the head commit, as understanding
   * context for the scan. Best-effort by design: a file that is removed,
   * binary (no hunks), oversized, or unfetchable is simply omitted — worse
   * context must never cost the review itself.
   */
  async getContext(pr: PrRef, files: readonly FileDiff[]): Promise<ContextFile[]> {
    const PER_FILE_MAX = 60_000;
    const TOTAL_MAX = 240_000;

    const IMPORT_MAX = 10;

    const wanted = files.filter((f) => f.status !== 'removed' && f.hunks.length > 0);
    const out: ContextFile[] = [];
    let budget = TOTAL_MAX;

    const take = async (path: string): Promise<ContextFile | null> => {
      if (budget <= 0) return null;
      let content: string;
      try {
        content = await this.getFile(pr, path, pr.headSha);
      } catch {
        return null;
      }
      if (!content || content.length > PER_FILE_MAX || content.length > budget) return null;
      budget -= content.length;
      const entry = { path, content };
      out.push(entry);
      return entry;
    };

    for (const file of wanted) await take(file.path);

    // Follow the changed files' imports: what a file builds on is the next
    // most useful thing to show. One tree request lists every repo path, so
    // resolving './helper' is a set lookup, not trial-and-error fetches.
    const tree = await this.getTree(pr).catch(() => null);
    if (tree) {
      const have = new Set(out.map((f) => f.path));
      const found: string[] = [];
      for (const file of out.slice()) {
        for (const imported of resolveImports(file.path, file.content, tree)) {
          if (!have.has(imported) && !found.includes(imported)) found.push(imported);
        }
      }
      for (const path of found.slice(0, IMPORT_MAX)) await take(path);
    }
    return out;
  }

  /** Every blob path in the repo at this commit; one request, recursive. */
  private async getTree(pr: PrRef): Promise<Set<string>> {
    const data = await this.request<{ tree?: { path?: string; type?: string }[] }>(
      `/repos/${pr.owner}/${pr.repo}/git/trees/${pr.headSha}?recursive=1`,
    );
    const paths = (data.tree ?? [])
      .filter((entry) => entry.type === 'blob' && entry.path)
      .map((entry) => entry.path as string);
    return new Set(paths);
  }

  async getFile(repo: RepoRef, path: string, ref: string): Promise<string> {
    // Filenames are attacker-controlled (git allows ? and #, and a PR chooses
    // its own paths); interpolated raw they rewrite the query or fragment of
    // a request that carries the user's token. Encode every segment.
    const safePath = path.split('/').map(encodeURIComponent).join('/');
    const data = await this.request<{ content?: string; encoding?: string }>(
      `/repos/${repo.owner}/${repo.repo}/contents/${safePath}?ref=${encodeURIComponent(ref)}`,
    );
    if (!data.content) return '';
    return data.encoding === 'base64' ? atob(data.content.replace(/\n/g, '')) : data.content;
  }
}
