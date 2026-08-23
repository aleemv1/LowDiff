import { render } from 'preact';
import { isPrDiffUrl, parsePrUrl } from '@lowdiff/context';
import { Overlay } from './Overlay.js';
import { clearBadges } from './annotate.js';
import { STYLES } from './theme.js';

const HOST_ID = 'lowdiff-root';
const TAG = '[LowDiff]';

console.info(TAG, 'content script loaded', window.location.pathname);

/**
 * Candidate mount points for the summary card, newest markup first.
 *
 * GitHub runs several generations of this page at once and rolls new ones out
 * per account, so more than one of these is live at any time. `main` is the
 * backstop that exists on every generation.
 */
const ANCHORS = [
  '[data-testid="diff-view"]',
  '.js-diff-progressive-container',
  '#files',
  '.diff-view',
  'main',
];

function findAnchor(): Element | null {
  for (const selector of ANCHORS) {
    const found = document.querySelector(selector);
    if (found) return found;
  }
  return null;
}

function mount(): boolean {
  if (!isPrDiffUrl(window.location.href)) return false;
  if (document.getElementById(HOST_ID)) return true;

  const location = parsePrUrl(window.location.href);
  if (!location) return false;

  const anchor = findAnchor();
  if (!anchor?.parentElement) return false;

  const host = document.createElement('div');
  host.id = HOST_ID;
  anchor.parentElement.insertBefore(host, anchor);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.append(style);

  const container = document.createElement('div');
  shadow.append(container);

  console.info(TAG, 'mounted before', anchor.tagName, anchor.className || '(no class)');
  render(<Overlay pr={location} />, container);
  return true;
}

function unmount(): void {
  clearBadges();
  document.getElementById(HOST_ID)?.remove();
}

/**
 * GitHub renders this view client-side and navigates without a page load, so a
 * one-shot mount at document_idle usually runs before the diff exists.
 */
let lastUrl = window.location.href;

new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    unmount();
  }
  if (!isPrDiffUrl(window.location.href)) {
    unmount();
    return;
  }
  mount();
}).observe(document.documentElement, { childList: true, subtree: true });

mount();
document.addEventListener('turbo:load', () => void mount());
document.addEventListener('pjax:end', () => void mount());
