import { parsePatch } from '@lowdiff/core';
import type { FileDiff, PrRef, RepoRef } from '@lowdiff/core';
import type { CodeHit, ContextProvider, PrMeta } from './types.js';

const API = 'https://api.github.com';

export interface GitHubOptions {
  /** Fine-grained PAT. Optional: public repos work unauthenticated at 60 req/hr. */
  token?: string;
  fetchImpl?: typeof fetch;
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

  constructor(options: GitHubOptions = {}) {
    this.token = options.token;
    // Bound to the global scope: stored as a plain instance property and
    // called as `this.fetchImpl(...)`, the real fetch receives the provider
    // as its `this` and throws "Illegal invocation".
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const response = await this.fetchImpl(`${API}${path}`, { headers });

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

  async getFile(repo: RepoRef, path: string, ref: string): Promise<string> {
    const data = await this.request<{ content?: string; encoding?: string }>(
      `/repos/${repo.owner}/${repo.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    );
    if (!data.content) return '';
    return data.encoding === 'base64' ? atob(data.content.replace(/\n/g, '')) : data.content;
  }
}
