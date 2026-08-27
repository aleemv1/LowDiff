import { anchorNotes, reanchor } from '@lowdiff/core';
import { GitHubContextProvider } from '@lowdiff/context';
// AnthropicClient directly, not createLlmClient: the factory pulls every
// provider SDK into the worker bundle, and this release ships Anthropic only.
import { AnthropicClient } from '@lowdiff/providers';
import type {
  AnnotateReply,
  ChatTurn,
  PrLocation,
  PublicSettingsReply,
  Request,
} from '../shared/messages.js';
import { loadSettings, saveSettings, toPublicSettings } from './storage.js';
import { readCache, writeCache } from './cache.js';

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
): Promise<AnnotateReply | PublicSettingsReply | ReposReply | { ok: true }> {
  switch (message.type) {
    case 'GET_PUBLIC_SETTINGS': {
      const settings = await loadSettings();
      return { ok: true, settings: toPublicSettings(settings) };
    }
    case 'ANNOTATE':
      return annotate(message.pr, message.refresh ?? false);
    case 'CHAT':
      await chat(message.pr, message.question, message.history, message.port);
      return { ok: true };
    case 'OPEN_OPTIONS':
      await chrome.runtime.openOptionsPage();
      return { ok: true };
  }
}

async function annotate(pr: PrLocation, refresh: boolean): Promise<AnnotateReply> {
  const settings = await loadSettings();
  const key = settings.keys.anthropic;
  if (!key) throw new Error('No Anthropic API key set. Open LowDiff options to add one.');

  const github = new GitHubContextProvider(
    settings.githubToken ? { token: settings.githubToken } : {},
  );
  const meta = await github.getPr(pr);
  const ref = { ...pr, headSha: meta.headSha };

  if (!refresh) {
    const cached = await readCache(pr.owner, pr.repo, pr.number, meta.headSha);
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

  // Whole-file context, so the model sees how the change sits in its files.
  // Best-effort: worse context must never cost the review itself.
  const context = await github.getContext(ref, files).catch(() => []);


  const llm = new AnthropicClient({
    provider: 'anthropic',
    auth: { kind: 'apiKey', key },
    ...(settings.model ? { model: settings.model } : {}),
  });

  const result = await llm.annotate({
    pr: ref,
    title: meta.title,
    body: meta.body,
    files,
    ...(context.length > 0 ? { context } : {}),
  });

  // Ground the model's claims against the diff it was actually shown.
  const notes = anchorNotes(result.notes, files);

  await writeCache(pr.owner, pr.repo, pr.number, meta.headSha, {
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
  const key = settings.keys.anthropic;
  if (!key) throw new Error('No Anthropic API key set. Open LowDiff options to add one.');

  const github = new GitHubContextProvider(
    settings.githubToken ? { token: settings.githubToken } : {},
  );
  const meta = await github.getPr(pr);
  const files = await github.getDiff({ ...pr, headSha: meta.headSha });

  // Hand chat the review the user is looking at. Without it, "Ask about this"
  // asks about a finding the model cannot see, and it re-derives an answer
  // that may not match the note on screen.
  const review = await readCache(pr.owner, pr.repo, pr.number, meta.headSha);

  const llm = new AnthropicClient({
    provider: 'anthropic',
    auth: { kind: 'apiKey', key },
    ...(settings.model ? { model: settings.model } : {}),
  });

  const port = pendingPorts.get(portName);
  if (!port) throw new Error('Chat connection closed before the answer started.');


  try {
    for await (const delta of llm.chat({
      pr: { ...pr, headSha: meta.headSha },
      title: meta.title,
      body: meta.body,
      files,
      summary: review?.summary ?? '',
      notes: review?.notes ?? [],
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
