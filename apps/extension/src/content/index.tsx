import { render } from 'preact';
import { GitHubContextProvider, parsePrUrl } from '@lowdiff/context';
import type { FileDiff } from '@lowdiff/core';
import { App } from './App.js';
import { STYLES } from './theme.js';

const HOST_ID = 'lowdiff-root';

/**
 * Mount point: the Files-changed tab.
 *
 * The overlay renders its own diff inside a Shadow DOM rather than injecting
 * badges into GitHub's markup. GitHub reships that markup regularly, and a
 * renderer coupled to it breaks on their schedule instead of ours. The shadow
 * boundary also stops GitHub's stylesheet reaching in.
 */
async function mount(): Promise<void> {
  const location = parsePrUrl(window.location.href);
  if (!location) return;
  if (!window.location.pathname.includes('/files')) return;
  if (document.getElementById(HOST_ID)) return;

  const anchor =
    document.querySelector('.js-diff-progressive-container') ??
    document.querySelector('#files') ??
    document.querySelector('main');
  if (!anchor) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  anchor.parentElement?.insertBefore(host, anchor);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.append(style);

  const container = document.createElement('div');
  shadow.append(container);

  let files: FileDiff[] = [];
  try {
    // Unauthenticated read is enough to render the diff; the worker holds the
    // token for authenticated calls.
    files = await new GitHubContextProvider().getDiff({ ...location, headSha: '' });
  } catch {
    files = [];
  }

  render(<App pr={location} files={files} />, container);
}

void mount();

// GitHub navigates client-side, so the content script only runs once per load.
document.addEventListener('turbo:load', () => void mount());
document.addEventListener('pjax:end', () => void mount());

let lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href === lastUrl) return;
  lastUrl = window.location.href;
  void mount();
}).observe(document.body, { childList: true, subtree: true });
