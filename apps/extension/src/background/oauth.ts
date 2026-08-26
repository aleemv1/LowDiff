import type { Settings } from '../shared/messages.js';

/**
 * Account credentials for providers that support them.
 *
 * Google rides chrome.identity: Chrome mints and refreshes tokens against the
 * signed-in profile, so LowDiff never stores one. The OAuth client id lives in
 * manifest.json (`oauth2`), created once in Google Cloud console as type
 * "Chrome Extension".
 *
 * OpenAI is RFC 8628 device code against auth.openai.com. Third-party client
 * ids are approved by OpenAI case by case — without an approved id this flow
 * has nothing to talk to, which is why the id is a setting, not a constant.
 */

export function googleToken(interactive: boolean): Promise<string | null> {
  return new Promise((done) => {
    try {
      chrome.identity.getAuthToken({ interactive }, (result?: unknown) => {
        if (chrome.runtime.lastError) {
          done(null);
          return;
        }
        // Chrome ≤114 hands back the token string; newer builds an object.
        const token =
          typeof result === 'string'
            ? result
            : ((result as { token?: string } | undefined)?.token ?? null);
        done(token);
      });
    } catch {
      done(null);
    }
  });
}

const OPENAI_DEVICE_URL = 'https://auth.openai.com/oauth/device/authorization';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';

export interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
}

export async function startOpenAiDeviceFlow(clientId: string): Promise<DeviceStart> {
  const response = await fetch(OPENAI_DEVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: 'openid profile offline_access' }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI device authorization failed (${response.status}).`);
  }
  const data = (await response.json()) as {
    device_code: string;
    user_code: string;
    verification_uri?: string;
    verification_uri_complete?: string;
    interval?: number;
  };
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri_complete ?? data.verification_uri ?? '',
    interval: data.interval ?? 5,
  };
}

export type DevicePoll =
  | { status: 'pending' }
  | { status: 'done'; accessToken: string; refreshToken: string; expiresAt: number };

export async function pollOpenAiDeviceFlow(
  clientId: string,
  deviceCode: string,
): Promise<DevicePoll> {
  const response = await fetch(OPENAI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const data = (await response.json()) as {
    error?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (data.error === 'authorization_pending' || data.error === 'slow_down') {
    return { status: 'pending' };
  }
  if (!response.ok || !data.access_token) {
    throw new Error(`OpenAI sign-in failed: ${data.error ?? response.status}.`);
  }
  return {
    status: 'done',
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? '',
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

export async function refreshOpenAiToken(
  clientId: string,
  refreshToken: string,
): Promise<NonNullable<Settings['openaiTokens']>> {
  const response = await fetch(OPENAI_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!response.ok || !data.access_token) {
    throw new Error('OpenAI session expired. Sign in again from LowDiff options.');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}
