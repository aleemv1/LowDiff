import { anchorNotes, reanchor } from '@lowdiff/core';
import { GitHubContextProvider } from '@lowdiff/context';
import { createLlmClient } from '@lowdiff/providers';
import type {
  AnnotateReply,
  ChatTurn,
  DiffReply,
  PrLocation,
  PublicSettingsReply,
  Request,
} from '../shared/messages.js';
import { loadSettings, toPublicSettings } from './storage.js';
import { readCache, writeCache } from './cache.js';
import type { Mode } from '@lowdiff/core';

/**
 * The service worker is the only place credentials exist.
 *
 * The content script shares an origin with github.com, so anything reachable
 * from there is reachable by any script GitHub loads. Keys stay here; the
 * content script sends intents and receives rendered results.
 */

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.runtime.openOptionsPage();
  }
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message: Request, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true; // keep the channel open for the async reply
});

async function handle(
  message: Request,
): Promise<AnnotateReply | PublicSettingsReply | DiffReply | { ok: true }> {
  switch (message.type) {
    case 'GET_PUBLIC_SETTINGS': {
      const settings = await loadSettings();
      return { ok: true, settings: toPublicSettings(settings) };
    }
    case 'GET_DIFF':
      return getDiff(message.pr);
    case 'ANNOTATE':
      return annotate(message.pr, message.mode, message.refresh ?? false);
    case 'CHAT':
      await chat(message.pr, message.question, message.history, message.port);
      return { ok: true };
    case 'OPEN_OPTIONS':
      await chrome.runtime.openOptionsPage();
      return { ok: true };
  }
}

/**
 * The content script cannot fetch this itself: it runs in github.com's page
 * context, so its requests are subject to that page's CSP and CORS. The
 * worker has host permissions and the stored token.
 */
async function getDiff(pr: PrLocation): Promise<DiffReply> {
  const settings = await loadSettings();
  const github = new GitHubContextProvider(
    settings.githubToken ? { token: settings.githubToken } : {},
  );
  const meta = await github.getPr(pr);
  const files = await github.getDiff({ ...pr, headSha: meta.headSha });
  return { ok: true, files };
}

async function annotate(pr: PrLocation, mode: Mode, refresh: boolean): Promise<AnnotateReply> {
  const settings = await loadSettings();
  const key = settings.keys[settings.provider];
  if (!key) {
    return {
      ok: false,
      error: `No API key set for ${settings.provider}. Open LowDiff options to add one.`,
    };
  }

  const github = new GitHubContextProvider(
    settings.githubToken ? { token: settings.githubToken } : {},
  );
  const meta = await github.getPr(pr);
  const ref = { ...pr, headSha: meta.headSha };

  if (!refresh) {
    const cached = await readCache(pr.owner, pr.repo, pr.number, meta.headSha, mode);
    if (cached) {
      return {
        ok: true,
        summary: cached.summary,
        notes: cached.notes,
        headSha: cached.headSha,
        cached: true,
        usage: cached.usage,
      };
    }
  }

  const files = await github.getDiff(ref);
  if (files.every((f) => f.hunks.length === 0)) {
    return { ok: false, error: 'This pull request has no textual diff to review.' };
  }

  const llm = createLlmClient({
    provider: settings.provider,
    auth: { kind: 'apiKey', key },
    ...(settings.model ? { model: settings.model } : {}),
  });

  const result = await llm.annotate({
    mode,
    pr: ref,
    title: meta.title,
    body: meta.body,
    files,
  });

  // Ground the model's claims against the diff it was actually shown.
  const notes = anchorNotes(result.notes, files);

  await writeCache(pr.owner, pr.repo, pr.number, meta.headSha, mode, {
    summary: result.summary,
    notes,
    headSha: meta.headSha,
    usage: result.usage,
  });

  return {
    ok: true,
    summary: result.summary,
    notes,
    headSha: meta.headSha,
    cached: false,
    usage: result.usage,
  };
}

async function chat(
  pr: PrLocation,
  question: string,
  history: ChatTurn[],
  portName: string,
): Promise<void> {
  const settings = await loadSettings();
  const key = settings.keys[settings.provider];
  if (!key) throw new Error(`No API key set for ${settings.provider}.`);

  const github = new GitHubContextProvider(
    settings.githubToken ? { token: settings.githubToken } : {},
  );
  const meta = await github.getPr(pr);
  const files = await github.getDiff({ ...pr, headSha: meta.headSha });

  const llm = createLlmClient({
    provider: settings.provider,
    auth: { kind: 'apiKey', key },
    ...(settings.model ? { model: settings.model } : {}),
  });

  const port = pendingPorts.get(portName);
  if (!port) throw new Error('Chat connection closed before the answer started.');

  try {
    for await (const delta of llm.chat({
      pr: { ...pr, headSha: meta.headSha },
      files,
      history,
      question,
    })) {
      port.postMessage(delta);
    }
  } catch (error) {
    port.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Chat streams over a long-lived port, since responses arrive incrementally. */
const pendingPorts = new Map<string, chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith('lowdiff-chat:')) return;
  pendingPorts.set(port.name, port);
  port.onDisconnect.addListener(() => pendingPorts.delete(port.name));
});

// Re-anchor is re-exported for the content script's optimistic path; keeping the
// import here documents that the worker owns grounding, not the renderer.
export { reanchor };
