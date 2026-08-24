/**
 * Client for the local lowdiff-daemon.
 *
 * The daemon is what gives chat reach beyond the diff: it greps and reads
 * repos the user registered, on their machine. Everything is capped
 * server-side, so this client stays a thin fetch wrapper.
 */
export interface DaemonOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class DaemonClient {
  private readonly token: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DaemonOptions) {
    this.token = options.token;
    this.base = options.baseUrl ?? 'http://127.0.0.1:7749';
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `daemon ${response.status}`);
    return data;
  }

  /** Fast reachability probe; a dead daemon must not stall chat. */
  async health(timeoutMs = 800): Promise<string[] | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await this.fetchImpl(`${this.base}/health`, {
        headers: { authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) return null;
      const data = (await response.json()) as { repos: string[] };
      return data.repos;
    } catch {
      return null;
    }
  }

  async addRepo(path: string, name?: string): Promise<string> {
    const data = await this.request<{ added: string }>('POST', '/repos', { path, name });
    return data.added;
  }

  async search(query: string, repo?: string): Promise<string> {
    const data = await this.request<{ matches: string[] }>('POST', '/search', { query, repo });
    return data.matches.length > 0 ? data.matches.join('\n') : '(no matches)';
  }

  async read(repo: string, path: string, startLine?: number): Promise<string> {
    const data = await this.request<{ lines: string[]; truncated: boolean; totalLines: number }>(
      'POST',
      '/read',
      { repo, path, startLine },
    );
    const body = data.lines.join('\n');
    return data.truncated ? `${body}\n[truncated — file has ${data.totalLines} lines]` : body;
  }
}
