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
  // This release ships Anthropic only; a stored provider from an earlier
  // build must not route the scan somewhere the UI cannot configure.
  return { ...DEFAULT_SETTINGS, ...value, keys: { ...(value?.keys ?? {}) }, provider: 'anthropic' };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}

/** Strip everything the content script must never see. */
export function toPublicSettings(settings: Settings): PublicSettings {
  return {
    provider: settings.provider,
    ...(settings.model !== undefined ? { model: settings.model } : {}),
    configured: Boolean(settings.keys.anthropic),
    autoScan: settings.autoScan ?? true,
    hiddenKinds: settings.hiddenKinds ?? [],
  };
}
