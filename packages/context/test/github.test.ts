import { describe, it, expect } from 'vitest';
import { GitHubContextProvider } from '../src/github.js';

function fakeFetch(
  handler: (url: string) => { status?: number; body?: unknown; headers?: Record<string, string> },
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const { status = 200, body = {}, headers = {} } = handler(String(input));
    return new Response(JSON.stringify(body), { status, headers });
  }) as typeof fetch;
}

const PR = { owner: 'acme', repo: 'search-api', number: 412, headSha: 'abc123' };

describe('GitHubContextProvider.getDiff', () => {
  it('parses patches into hunks with line numbers', async () => {
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch(() => ({
        body: [
          {
            filename: 'src/a.ts',
            status: 'modified',
            additions: 1,
            deletions: 1,
            patch: '@@ -1,2 +1,2 @@\n ctx\n-old\n+new',
          },
        ],
      })),
    });

    const files = await provider.getDiff(PR);
    expect(files).toHaveLength(1);
    expect(files[0]!.hunks[0]!.lines.map((l) => l.text)).toEqual(['ctx', 'old', 'new']);
  });

  it('handles binary files that come back with no patch', async () => {
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch(() => ({
        body: [{ filename: 'logo.png', status: 'added', additions: 0, deletions: 0 }],
      })),
    });
    expect((await provider.getDiff(PR))[0]!.hunks).toEqual([]);
  });

  it('records the previous path for a rename', async () => {
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch(() => ({
        body: [
          {
            filename: 'b.ts',
            previous_filename: 'a.ts',
            status: 'renamed',
            additions: 0,
            deletions: 0,
          },
        ],
      })),
    });
    const file = (await provider.getDiff(PR))[0]!;
    expect(file.status).toBe('renamed');
    expect(file.previousPath).toBe('a.ts');
  });
});

describe('GitHubContextProvider errors', () => {
  it('tells an unauthenticated user how to raise the rate limit', async () => {
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch(() => ({
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      })),
    });
    await expect(provider.getDiff(PR)).rejects.toThrow(/60 to 5,000/);
  });

  it('does not suggest a token to someone who already has one', async () => {
    const provider = new GitHubContextProvider({
      token: 'ghp_x',
      fetchImpl: fakeFetch(() => ({
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      })),
    });
    await expect(provider.getDiff(PR)).rejects.toThrow(/Wait for the window/);
  });

  it('explains that a 404 may mean a private repo', async () => {
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch(() => ({ status: 404 })),
    });
    await expect(provider.getDiff(PR)).rejects.toThrow(/Private repositories/);
  });
});

describe('GitHubContextProvider.getPr', () => {
  it('returns the head sha and a null body as empty string', async () => {
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch(() => ({
        body: { title: 'fix: debounce', body: null, head: { sha: 'deadbeef' } },
      })),
    });
    const meta = await provider.getPr({ owner: 'a', repo: 'b', number: 1 });
    expect(meta).toEqual({ title: 'fix: debounce', body: '', headSha: 'deadbeef' });
  });
});

describe('GitHubContextProvider.searchCode', () => {
  it('does not call the API when no repos are in scope', async () => {
    let called = false;
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch(() => {
        called = true;
        return { body: { items: [] } };
      }),
    });
    expect(await provider.searchCode('useDebounce', [])).toEqual([]);
    expect(called).toBe(false);
  });
});

describe('GitHubContextProvider default fetch', () => {
  it('calls the global fetch with its own binding', async () => {
    // A real `fetch` throws "Illegal invocation" when its `this` is anything
    // other than the global scope, which is what happens if it is stored as an
    // instance property and called as `this.fetchImpl(...)`.
    const original = globalThis.fetch;
    globalThis.fetch = function (this: unknown) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch': Illegal invocation");
      }
      return Promise.resolve(
        new Response(JSON.stringify({ title: 't', body: null, head: { sha: 'abc' } })),
      );
    } as typeof fetch;

    try {
      const provider = new GitHubContextProvider();
      await expect(
        provider.getPr({ owner: 'a', repo: 'b', number: 1 }),
      ).resolves.toMatchObject({ headSha: 'abc' });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('GitHubContextProvider retries', () => {
  const noSleep = () => Promise.resolve();

  it('retries a 504 and succeeds', async () => {
    let calls = 0;
    const provider = new GitHubContextProvider({
      sleepImpl: noSleep,
      fetchImpl: (async () => {
        calls++;
        if (calls < 3) return new Response('', { status: 504 });
        return new Response(JSON.stringify({ title: 't', body: '', head: { sha: 'ok' } }));
      }) as typeof fetch,
    });

    await expect(provider.getPr({ owner: 'a', repo: 'b', number: 1 })).resolves.toMatchObject({
      headSha: 'ok',
    });
    expect(calls).toBe(3);
  });

  it('gives up after the configured attempts', async () => {
    let calls = 0;
    const provider = new GitHubContextProvider({
      retries: 2,
      sleepImpl: noSleep,
      fetchImpl: (async () => {
        calls++;
        return new Response('', { status: 502 });
      }) as typeof fetch,
    });

    await expect(provider.getPr({ owner: 'a', repo: 'b', number: 1 })).rejects.toThrow(/502/);
    expect(calls).toBe(2);
  });

  it('does not retry a 404 — it will never succeed', async () => {
    let calls = 0;
    const provider = new GitHubContextProvider({
      sleepImpl: noSleep,
      fetchImpl: (async () => {
        calls++;
        return new Response('', { status: 404 });
      }) as typeof fetch,
    });

    await expect(provider.getPr({ owner: 'a', repo: 'b', number: 1 })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it('does not retry a rate limit — waiting out the window is the fix', async () => {
    let calls = 0;
    const provider = new GitHubContextProvider({
      sleepImpl: noSleep,
      fetchImpl: (async () => {
        calls++;
        return new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
      }) as typeof fetch,
    });

    await expect(provider.getPr({ owner: 'a', repo: 'b', number: 1 })).rejects.toThrow(/rate limit/);
    expect(calls).toBe(1);
  });
});

describe('GitHubContextProvider.getContext', () => {
  const b64 = (text: string) => btoa(text);
  const files = (over: Record<string, unknown> = {}) => [
    { path: 'src/a.ts', status: 'modified', additions: 1, deletions: 0, hunks: [{}], ...over },
  ];

  it('fetches the full contents of changed files at the head commit', async () => {
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch((url) => ({
        body: url.includes('/contents/')
          ? { content: b64('const a = 1;'), encoding: 'base64' }
          : {},
      })),
    });
    const ctx = await provider.getContext(PR, files() as never);
    expect(ctx).toEqual([{ path: 'src/a.ts', content: 'const a = 1;' }]);
  });

  it('skips removed files and files whose diff carried no hunks', async () => {
    const provider = new GitHubContextProvider({ fetchImpl: fakeFetch(() => ({ body: {} })) });
    const ctx = await provider.getContext(PR, [
      { path: 'gone.ts', status: 'removed', additions: 0, deletions: 3, hunks: [{}] },
      { path: 'image.png', status: 'added', additions: 0, deletions: 0, hunks: [] },
    ] as never);
    expect(ctx).toEqual([]);
  });

  it('omits oversized files rather than truncating them mid-function', async () => {
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch(() => ({ body: { content: b64('x'.repeat(70_000)), encoding: 'base64' } })),
    });
    const ctx = await provider.getContext(PR, files() as never);
    expect(ctx).toEqual([]);
  });

  it('keeps fetch failures out of the result instead of failing the scan', async () => {
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch((url) => (url.includes('bad.ts') ? { status: 404 } : { body: { content: b64('ok'), encoding: 'base64' } })),
    });
    const ctx = await provider.getContext(PR, [
      ...files(),
      { path: 'bad.ts', status: 'modified', additions: 1, deletions: 0, hunks: [{}] },
    ] as never);
    expect(ctx).toEqual([{ path: 'src/a.ts', content: 'ok' }]);
  });
});

describe('GitHubContextProvider import context', () => {
  const b64 = (text: string) => btoa(text);

  it('follows relative imports of changed files via the repo tree', async () => {
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch((url) => {
        if (url.includes('/git/trees/')) {
          return { body: { tree: [{ path: 'src/a.ts', type: 'blob' }, { path: 'src/helper.ts', type: 'blob' }] } };
        }
        if (url.includes('/contents/src%2Fhelper.ts') || url.includes('/contents/src/helper.ts')) {
          return { body: { content: b64('export const help = 1;'), encoding: 'base64' } };
        }
        return { body: { content: b64("import { help } from './helper.js';"), encoding: 'base64' } };
      }),
    });
    const ctx = await provider.getContext(PR, [
      { path: 'src/a.ts', status: 'modified', additions: 1, deletions: 0, hunks: [{}] },
    ] as never);
    expect(ctx.map((f) => f.path)).toEqual(['src/a.ts', 'src/helper.ts']);
    expect(ctx[1]!.content).toBe('export const help = 1;');
  });

  it('survives a failing tree API — changed files still arrive', async () => {
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch((url) =>
        url.includes('/git/trees/')
          ? { status: 500 }
          : { body: { content: b64('code'), encoding: 'base64' } },
      ),
    });
    const ctx = await provider.getContext(PR, [
      { path: 'src/a.ts', status: 'modified', additions: 1, deletions: 0, hunks: [{}] },
    ] as never);
    expect(ctx.map((f) => f.path)).toEqual(['src/a.ts']);
  });
});

describe('GitHubContextProvider path encoding', () => {
  it('percent-encodes hostile filename characters, keeping the slashes', async () => {
    const urls: string[] = [];
    const provider = new GitHubContextProvider({
      fetchImpl: fakeFetch((url) => {
        urls.push(url);
        return { body: { content: btoa('x'), encoding: 'base64' } };
      }),
    });
    // Git allows ? and # in filenames; interpolated raw they rewrite the
    // query and fragment of a credentialed request.
    await provider.getFile(PR, 'dir/a?b#c.ts', 'abc123');
    expect(urls[0]).toContain('/contents/dir/a%3Fb%23c.ts?ref=abc123');
  });
});
