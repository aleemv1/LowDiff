import { render } from 'preact';
import { isPrDiffUrl, parsePrUrl } from '@lowdiff/context';
import { Overlay } from './Overlay.js';
import { clearBadges } from './annotate.js';
import { watch } from './watch.js';
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
  // Client-rendered view: the diff area itself, so the card lands directly
  // above the first file rather than over the PR header.
  '#diff-comparison-viewer-container',
  '[data-testid="diff-view"]',
  // Classic server-rendered view.
  '.js-diff-progressive-container',
  '#files',
  '.diff-view',
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
  if (!anchor) return false;

  const host = document.createElement('div');
  host.id = HOST_ID;
  // Prepended *inside* the diff container rather than inserted before it: as a
  // sibling it becomes a flex/grid item in GitHub's layout row and squeezes the
  // page. These styles keep the host from affecting their layout either way.
  // No `contain: layout` here: it would make the host a containing block for
  // position:fixed descendants, pinning the chat panel and its button to this
  // box instead of the viewport.
  Object.assign(host.style, {
    display: 'block',
    width: '100%',
    flex: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  anchor.prepend(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.append(style);

  const container = document.createElement('div');
  shadow.append(container);

  console.info(TAG, 'mounted inside', anchor.tagName, anchor.id || anchor.className || '(anon)');
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

watch(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    unmount();
  }
  if (!isPrDiffUrl(window.location.href)) {
    unmount();
    return;
  }
  mount();
});
