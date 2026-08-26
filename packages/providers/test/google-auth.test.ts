import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLlmClient } from '../src/index.js';

/**
 * OAuth tokens are not API keys. The Gemini API takes an account token in an
 * `Authorization: Bearer` header; sending it as `x-goog-api-key` (what the
 * SDK does with its `apiKey` option) is rejected. Stub fetch and inspect the
 * headers the SDK actually sends.
 */
function capture() {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      seen.push({ url: String(input), headers });
      return new Response(JSON.stringify({ error: 'stub' }), { status: 500 });
    }),
  );
  return seen;
}

const req = {
  pr: { owner: 'o', repo: 'r', number: 1, headSha: 'sha' },
  title: 't',
  body: '',
  files: [],
};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('google auth', () => {
  it('sends an API key as the API-key header', async () => {
    const seen = capture();
    const llm = createLlmClient({ provider: 'google', auth: { kind: 'apiKey', key: 'k-123' } });
    await llm.annotate(req).catch(() => {});
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]!.headers['x-goog-api-key']).toBe('k-123');
  });

  it('sends an OAuth token as a Bearer header, not as a key', async () => {
    const seen = capture();
    const llm = createLlmClient({
      provider: 'google',
      auth: { kind: 'oauth', accessToken: 'tok-456', refreshToken: '', expiresAt: 0 },
    });
    await llm.annotate(req).catch(() => {});
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]!.headers['authorization']).toBe('Bearer tok-456');
    expect(seen[0]!.headers['x-goog-api-key'] ?? '').not.toBe('tok-456');
  });
});
