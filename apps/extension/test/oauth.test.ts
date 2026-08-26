import { afterEach, describe, expect, it, vi } from 'vitest';
import { pollOpenAiDeviceFlow, startOpenAiDeviceFlow } from '../src/background/oauth.js';

afterEach(() => vi.unstubAllGlobals());

function stub(status: number, body: unknown) {
  const calls: { url: string; body: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

describe('openai device flow', () => {
  it('requests a device code with the configured client id', async () => {
    const calls = stub(200, {
      device_code: 'd',
      user_code: 'U-1',
      verification_uri: 'https://x',
      interval: 7,
    });
    const start = await startOpenAiDeviceFlow('client-1');
    expect(calls[0]!.url).toContain('auth.openai.com/oauth/device');
    expect(calls[0]!.body).toContain('client_id=client-1');
    expect(start).toEqual({
      deviceCode: 'd',
      userCode: 'U-1',
      verificationUri: 'https://x',
      interval: 7,
    });
  });

  it('reports pending while the user has not approved yet', async () => {
    stub(400, { error: 'authorization_pending' });
    expect(await pollOpenAiDeviceFlow('c', 'd')).toEqual({ status: 'pending' });
  });

  it('exchanges the device code with the device grant', async () => {
    const calls = stub(200, { access_token: 'a', refresh_token: 'r', expires_in: 60 });
    const poll = await pollOpenAiDeviceFlow('c', 'd');
    expect(calls[0]!.body).toContain('urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code');
    expect(poll.status).toBe('done');
  });

  it('surfaces a denied sign-in as an error', async () => {
    stub(400, { error: 'access_denied' });
    await expect(pollOpenAiDeviceFlow('c', 'd')).rejects.toThrow(/access_denied/);
  });
});
