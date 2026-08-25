import { anchorNotes, reanchor } from '@lowdiff/core';
import { DaemonClient, GitHubContextProvider } from '@lowdiff/context';
import { createLlmClient } from '@lowdiff/providers';
import type {
  AnnotateReply,
  ChatTurn,
  ReposReply,
  PrLocation,
  PublicSettingsReply,
  Request,
} from '../shared/messages.js';
import { loadSettings, toPublicSettings } from './storage.js';
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
    case 'ADD_REPO': {
      const settings = await loadSettings();
      if (!settings.daemonToken) return { ok: false, error: 'Set the daemon token in options first.' };
      const daemon = new DaemonClient({ token: settings.daemonToken });
      const added = await daemon.addRepo(message.path);
      const repos = (await daemon.health()) ?? [];
      return { ok: true, repos: repos.length > 0 ? repos : [added] };
    }
    case 'LIST_REPOS': {
      const settings = await loadSettings();
      if (!settings.daemonToken) return { ok: true, repos: [] };
      const repos = await new DaemonClient({ token: settings.daemonToken }).health();
      return { ok: true, repos: repos ?? [] };
    }
    case 'OPEN_OPTIONS':
      await chrome.runtime.openOptionsPage();
      return { ok: true };
  }
}

async function annotate(pr: PrLocation, refresh: boolean): Promise<AnnotateReply> {
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

  const llm = createLlmClient({
    provider: settings.provider,
    auth: { kind: 'apiKey', key },
    ...(settings.model ? { model: settings.model } : {}),
  });

  const result = await llm.annotate({
    pr: ref,
    title: meta.title,
    body: meta.body,
    files,
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
  const key = settings.keys[settings.provider];
  if (!key) throw new Error(`No API key set for ${settings.provider}.`);

  const github = new GitHubContextProvider(
    settings.githubToken ? { token: settings.githubToken } : {},
  );
  const meta = await github.getPr(pr);
  const files = await github.getDiff({ ...pr, headSha: meta.headSha });

  // Hand chat the review the user is looking at. Without it, "Ask about this"
  // asks about a finding the model cannot see, and it re-derives an answer
  // that may not match the note on screen.
  const review = await readCache(pr.owner, pr.repo, pr.number, meta.headSha);

  const llm = createLlmClient({
    provider: settings.provider,
    auth: { kind: 'apiKey', key },
    ...(settings.model ? { model: settings.model } : {}),
  });

  const port = pendingPorts.get(portName);
  if (!port) throw new Error('Chat connection closed before the answer started.');

  // Repo search rides on the local daemon; a missing or dead daemon simply
  // means chat runs diff-only, at no extra cost.
  let tools;
  if (settings.daemonToken) {
    const daemon = new DaemonClient({ token: settings.daemonToken });
    const repoNames = await daemon.health();
    if (repoNames && repoNames.length > 0) {
      tools = {
        repoNames,
        search: (query: string, repo?: string) => daemon.search(query, repo),
        read: (repo: string, path: string, startLine?: number) => daemon.read(repo, path, startLine),
      };
    }
  }

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
      ...(tools ? { tools } : {}),
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
