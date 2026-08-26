import type { PublicSettings, Settings } from '../shared/messages.js';
import { DEFAULT_SETTINGS } from '../shared/messages.js';

const KEY = 'lowdiff:settings';

/**
 * Credentials live in `chrome.storage.local`, never `chrome.storage.sync`.
 *
 * `sync` would replicate API keys and OAuth tokens through Google's servers to
 * every browser the user is signed into, which is not somewhere a user's
 * Anthropic key should end up.
 */
export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  const value = stored[KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...value, keys: { ...(value?.keys ?? {}) } };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}

/** Strip everything the content script must never see. */
export function toPublicSettings(settings: Settings): PublicSettings {
  return {
    provider: settings.provider,
    ...(settings.model !== undefined ? { model: settings.model } : {}),
    defaultMode: settings.defaultMode,
    configured:
      Boolean(settings.keys[settings.provider]) ||
      (settings.provider === 'google' && Boolean(settings.googleAccount)) ||
      (settings.provider === 'openai' && Boolean(settings.openaiTokens)),
    hiddenKinds: settings.hiddenKinds ?? [],
  };
}
