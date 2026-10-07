/** @vitest-environment happy-dom */
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Note } from '@lowdiff/core';
import { Overlay } from '../src/content/Overlay.js';

const note: Note = { kind: 'RISK', title: 'Request race', body: 'Cancel earlier requests.', confidence: 'high',
  anchor: { path: 'search.ts', side: 'RIGHT', line: 26, lineHash: 'abc' } };
const rows = [25, 26, 27].map(n => `<tr><td data-diff-side="right" data-line-number="${n}">${n}</td><td data-diff-side="right" data-line-number="${n}" data-line-anchor="R${n}">code ${n}</td></tr>`).join('');
let root: HTMLDivElement;
let overlay: HTMLDivElement;
let receive: (delta: unknown) => void;
let changeSettings: (changes: unknown) => void;
let reviewNotes: Note[];
let annotateReply: () => Promise<unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  reviewNotes = [note];
  annotateReply = async () => ({ ok: true, notes: reviewNotes, summary: 'A race.', cached: true });
  document.body.innerHTML = `<table role="grid" aria-label="Diff for: search.ts"><tbody>${rows}</tbody></table>`;
  root = document.createElement('div'); overlay = document.createElement('div');
  document.body.append(root, overlay);
  vi.stubGlobal('chrome', { storage: { onChanged: { addListener: (fn: typeof changeSettings) => { changeSettings = fn; }, removeListener: () => {} } }, runtime: {
    id: 'test',
    sendMessage: async (request: { type: string }) => request.type === 'GET_PUBLIC_SETTINGS'
      ? { ok: true, settings: { configured: true, hiddenKinds: [] } }
      : request.type === 'ANNOTATE' ? annotateReply() : { ok: true },
    connect: () => ({ onMessage: { addListener: (fn: typeof receive) => { receive = fn; } },
      onDisconnect: { addListener: () => {} }, disconnect: () => {} }),
  } });
});
afterEach(() => {
  act(() => render(null, root));
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => { render(h(Overlay, { pr: { owner: 'acme', repo: 'search', number: 412 }, overlayRoot: overlay }), root); });
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
}
function thread() {
  return document.querySelector('[data-lowdiff-thread] td > div')!.shadowRoot!;
}

it('renders the full discussion beneath the line with code continuing below', async () => {
  await mount();
  expect(thread().textContent).toContain('Request race');
  const row = document.querySelector('[data-lowdiff-thread]')!;
  expect(row.previousElementSibling!.textContent).toContain('code 26');
  expect(row.nextElementSibling!.textContent).toContain('code 27');
});

it('preserves a draft and streaming reply through same-size row replacement', async () => {
  await mount();
  const input = thread().querySelector('textarea')!;
  act(() => { input.value = 'Why?'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  act(() => thread().querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  act(() => receive({ type: 'text', text: 'An earlier request ' }));
  document.querySelector('tbody')!.innerHTML = rows;
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  act(() => receive({ type: 'text', text: 'can finish last.' }));
  act(() => receive({ type: 'done' }));
  expect(thread().textContent).toContain('An earlier request can finish last.');
  expect(thread().textContent).toContain('Why?');
  const nextInput = thread().querySelector('textarea')!;
  act(() => { nextInput.value = 'Draft'; nextInput.dispatchEvent(new Event('input', { bubbles: true })); });
  document.querySelector('tbody')!.innerHTML = rows;
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  expect(thread().querySelector('textarea')!.value).toBe('Draft');
});

it('continues in the right chat and removes injected rows and layout styles on unmount', async () => {
  const initialStyles = document.head.querySelectorAll('style').length;
  await mount();
  act(() => [...thread().querySelectorAll('button')].find(b => b.textContent?.includes('Continue in chat'))!.click());
  expect(overlay.textContent).toContain('Cancel earlier requests.');
  expect(overlay.querySelector('textarea')?.placeholder).toContain('Ask anything about this PR');
  act(() => render(null, root));
  expect(document.querySelector('[data-lowdiff-thread]')).toBeNull();
  expect(document.querySelector('[data-lowdiff-badge]')).toBeNull();
  expect(overlay.textContent).toBe('');
  expect(document.head.querySelectorAll('style').length).toBe(initialStyles);
  expect(document.body.hasAttribute('data-lowdiff-chat-open')).toBe(false);
});

it('keeps follow-up drafts when a finding kind is hidden and restored', async () => {
  await mount();
  const original = thread();
  const input = original.querySelector('textarea')!;
  act(() => { input.value = 'Keep my draft'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  act(() => changeSettings({ 'lowdiff:settings': { newValue: { hiddenKinds: ['RISK'] } } }));
  expect(document.querySelector('[data-lowdiff-thread]')).toBeNull();
  act(() => changeSettings({ 'lowdiff:settings': { newValue: { hiddenKinds: [] } } }));
  expect(thread()).toBe(original);
  expect(thread().querySelector('textarea')!.value).toBe('Keep my draft');
});

const explanation: Note = { ...note, kind: 'EXPLAIN', title: 'Debounce the input',
  anchor: { ...note.anchor, line: 25, lineHash: 'first' } };
const lastNote: Note = { ...note, kind: 'PERF', title: 'Request race',
  anchor: { ...note.anchor, line: 27, lineHash: 'last' } };
function dock() { return overlay.querySelector('nav[aria-label="Annotation navigation"]')!; }
function jumpButton() { return dock().querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!; }
function jumpRows() { return [...dock().querySelectorAll<HTMLButtonElement>('[role="dialog"] li button')]; }
function nextButton() { return dock().querySelector<HTMLButtonElement>('[aria-label="Next annotation"]')!; }
function expectChatOpen(open: boolean) {
  const panel = overlay.querySelector<HTMLElement>('.chat-panel');
  expect(panel).not.toBeNull();
  expect(panel!.getAttribute('aria-hidden')).toBe(String(!open));
  expect(panel!.hasAttribute('inert')).toBe(!open);
}
function selectedLine() {
  return document.querySelector('[data-lowdiff-highlit] [data-line-number]')?.getAttribute('data-line-number');
}

it('jumps from the floating list in diff order and opens the selected annotation', async () => {
  reviewNotes = [lastNote, note, explanation];
  await mount();
  expect(dock()).not.toBeNull();
  act(() => jumpButton().click());
  expect(jumpRows().map(row => row.textContent)).toEqual([
    expect.stringContaining('Debounce the input'), expect.stringContaining('search.ts:26'),
    expect.stringContaining('search.ts:27'),
  ]);
  act(() => jumpRows()[0]!.click());
  expect(selectedLine()).toBe('25');
  expect(jumpButton().textContent).toContain('1/3');
  expect(dock().querySelector('[role="dialog"]')).toBeNull();
  const discussion = [...document.querySelectorAll('[data-lowdiff-thread] td > div')]
    .find(host => host.shadowRoot?.textContent?.includes('Debounce the input'))!.shadowRoot!;
  expect(discussion.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('true');
});

it('keeps the navigation cursor on the same note across redraws and filters', async () => {
  reviewNotes = [lastNote, note, explanation];
  await mount();
  expect(dock()).not.toBeNull();
  act(() => jumpButton().click());
  act(() => jumpRows()[1]!.click());
  expect(jumpButton().textContent).toContain('2/3');
  document.querySelector('tbody')!.innerHTML = rows;
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  expect(selectedLine()).toBe('26');
  act(() => changeSettings({ 'lowdiff:settings': { newValue: { hiddenKinds: ['EXPLAIN'] } } }));
  expect(jumpButton().textContent).toContain('1/2');
  act(() => nextButton().click());
  expect(selectedLine()).toBe('27');
  expect(jumpButton().textContent).toContain('2/2');
  act(() => nextButton().click());
  expect(selectedLine()).toBe('26');
  act(() => changeSettings({ 'lowdiff:settings': { newValue: { hiddenKinds: ['EXPLAIN', 'RISK', 'PERF'] } } }));
  expect(dock()).toBeNull();
  expect(selectedLine()).toBeUndefined();
});

it('lists unavailable annotations and enables them when their lines load', async () => {
  const missing: Note = { ...lastNote, anchor: { ...lastNote.anchor, path: 'later.ts' } };
  reviewNotes = [note, missing];
  await mount();
  expect(dock()).not.toBeNull();
  act(() => jumpButton().click());
  expect(jumpRows()[1]!.disabled).toBe(true);
  expect(jumpRows()[1]!.textContent).toContain('Not loaded');
  document.body.insertAdjacentHTML('beforeend', `<table role="grid" aria-label="Diff for: later.ts"><tbody>${rows}</tbody></table>`);
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  expect(jumpRows()[1]!.disabled).toBe(false);
  act(() => jumpRows()[1]!.click());
  expect(document.querySelector('[data-lowdiff-highlit]')?.closest('table')?.getAttribute('aria-label')).toBe('Diff for: later.ts');
});

it('supports keyboard navigation, Escape and outside-click dismissal', async () => {
  reviewNotes = [note, explanation];
  await mount();
  expect(dock()).not.toBeNull();
  await act(async () => jumpButton().click());
  expect(document.activeElement).toBe(jumpRows()[0]);
  act(() => jumpRows()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  expect(document.activeElement).toBe(jumpRows()[1]);
  act(() => jumpRows()[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(dock().querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(jumpButton());
  await act(async () => jumpButton().click());
  act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(dock().querySelector('[role="dialog"]')).toBeNull();
});

it('keeps the count in sync when a badge is clicked directly', async () => {
  reviewNotes = [note, explanation];
  await mount();
  expect(dock()).not.toBeNull();
  act(() => document.querySelector<HTMLElement>('[data-line-anchor="R26"] [data-lowdiff-badge]')!.click());
  expect(jumpButton().textContent).toContain('2/2');
  expect(jumpButton().getAttribute('aria-label')).toContain('2/2');
});

it('keeps the previous annotations usable while a refresh replaces the review', async () => {
  await mount();
  let finishReview!: (reply: unknown) => void;
  annotateReply = () => new Promise(resolve => { finishReview = resolve; });
  await act(async () => root.querySelector<HTMLButtonElement>('[title="Re-run against the current commit"]')!.click());
  expect(dock().querySelector('[role="status"]')?.textContent).toContain('Reviewing');
  await act(async () => jumpButton().click());
  expect(jumpRows()[0]!.disabled).toBe(false);
  act(() => jumpRows()[0]!.click());
  expect(selectedLine()).toBe('26');
  expect(jumpButton().textContent).toContain('1/1');
  await act(async () => jumpButton().click());

  await act(async () => {
    finishReview({ ok: true, notes: [explanation], summary: 'New review.', cached: false });
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(dock().querySelector('[role="status"]')).toBeNull();
  expect(document.querySelectorAll('[data-lowdiff-badge]')).toHaveLength(1);
  expect(jumpRows()[0]!.textContent).toContain('Debounce the input');
  expect(jumpRows()[0]!.textContent).not.toContain('Request race');
  act(() => jumpRows()[0]!.click());
  expect(selectedLine()).toBe('25');
});

it.each([
  ['no findings', { ok: true, notes: [], summary: 'No issues found.', cached: false }],
  ['a failed review', { ok: false, error: 'The provider is unavailable.' }],
  ['an idle review', { ok: true, idle: true }],
])('removes the open navigator and previous annotations after %s', async (_label, reply) => {
  await mount();
  act(() => document.querySelector<HTMLElement>('[data-lowdiff-badge]')!.click());
  await act(async () => jumpButton().click());
  expect(jumpRows()).toHaveLength(1);
  annotateReply = async () => reply;
  await act(async () => {
    root.querySelector<HTMLButtonElement>('[title="Re-run against the current commit"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(dock()).toBeNull();
  expect(overlay.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('[data-lowdiff-badge]')).toBeNull();
  expect(document.querySelector('[data-lowdiff-thread]')).toBeNull();
  expect(selectedLine()).toBeUndefined();
});

it.each([false, true])('keeps keyboard focus when a filter removes the focused annotation (shadow: %s)', async inShadow => {
  let focusRoot: Document | ShadowRoot = document;
  if (inShadow) {
    const host = document.createElement('div');
    document.body.append(host);
    focusRoot = host.attachShadow({ mode: 'open' });
    focusRoot.append(overlay);
  }
  reviewNotes = [explanation, note];
  await mount();
  await act(async () => jumpButton().click());
  expect(focusRoot.activeElement).toBe(jumpRows()[0]);
  await act(async () => changeSettings({ 'lowdiff:settings': { newValue: { hiddenKinds: ['EXPLAIN'] } } }));
  expect(jumpRows()).toHaveLength(1);
  expect(focusRoot.activeElement).toBe(jumpRows()[0]);
  act(() => jumpRows()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(dock().querySelector('[role="dialog"]')).toBeNull();
  expect(focusRoot.activeElement).toBe(jumpButton());
});

it('preserves keyboard focus on a surviving menu row when another kind is filtered', async () => {
  reviewNotes = [explanation, note, lastNote];
  await mount();
  await act(async () => jumpButton().click());
  act(() => jumpRows()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  const focused = jumpRows()[1]!;
  expect(document.activeElement).toBe(focused);
  await act(async () => changeSettings({ 'lowdiff:settings': { newValue: { hiddenKinds: ['EXPLAIN'] } } }));
  expect(jumpRows()).toHaveLength(2);
  expect(document.activeElement).toBe(focused);
});

it('keeps the open menu keyboard accessible when every diff table is removed and later restored', async () => {
  await mount();
  await act(async () => jumpButton().click());
  expect(document.activeElement).toBe(jumpRows()[0]);
  document.querySelector('table')!.remove();
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  expect(jumpRows()[0]!.disabled).toBe(true);
  expect(nextButton().disabled).toBe(true);
  expect(dock().querySelector<HTMLButtonElement>('[aria-label="Previous annotation"]')!.disabled).toBe(true);
  expect(document.activeElement).toBe(dock().querySelector('[role="dialog"]'));

  document.body.insertAdjacentHTML('afterbegin', `<table role="grid" aria-label="Diff for: search.ts"><tbody>${rows}</tbody></table>`);
  await act(async () => { await vi.advanceTimersByTimeAsync(750); });
  expect(jumpRows()[0]!.disabled).toBe(false);
  act(() => dock().querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
  expect(document.activeElement).toBe(jumpRows()[0]);
  act(() => jumpRows()[0]!.click());
  expect(selectedLine()).toBe('26');
});

it('handles inside pointers, outside dismissal and keyboard events in a real shadow root', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(overlay);
  await mount();
  await act(async () => jumpButton().click());
  expect(shadow.activeElement).toBe(jumpRows()[0]);
  act(() => jumpRows()[0]!.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true })));
  expect(jumpRows()).toHaveLength(1);
  const githubHotkey = vi.fn();
  document.addEventListener('keydown', githubHotkey);
  try {
    act(() => jumpRows()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })));
    expect(githubHotkey).not.toHaveBeenCalled();
    expect(dock().querySelector('[role="dialog"]')).toBeNull();
    expect(shadow.activeElement).toBe(jumpButton());
    await act(async () => jumpButton().click());
    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true })));
    expect(dock().querySelector('[role="dialog"]')).toBeNull();
  } finally {
    document.removeEventListener('keydown', githubHotkey);
  }
});

it.each([false, true])('opens chat from the dock, dismisses the jump menu and retains a draft (shadow: %s)', async inShadow => {
  let focusRoot: Document | ShadowRoot = document;
  if (inShadow) {
    const host = document.createElement('div');
    document.body.append(host);
    focusRoot = host.attachShadow({ mode: 'open' });
    focusRoot.append(overlay);
  }
  await mount();
  const opener = dock().querySelector<HTMLButtonElement>('button[aria-label="Open LowDiff chat"]');
  expect(opener).not.toBeNull();
  expect(opener!.getAttribute('aria-expanded')).toBe('false');
  expect(overlay.querySelectorAll('button[aria-label="Open LowDiff chat"]')).toHaveLength(1);
  await act(async () => jumpButton().click());
  expect(dock().querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => opener!.click());
  expect(opener!.getAttribute('aria-expanded')).toBe('true');
  expect(dock().querySelector('[role="dialog"]')).toBeNull();
  const composer = overlay.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask anything about this PR"]')!;
  expect(composer).not.toBeNull();
  expect(focusRoot.activeElement).toBe(composer);
  act(() => {
    composer.value = 'Could the earlier request win?';
    composer.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => overlay.querySelector<HTMLButtonElement>('button[aria-label="Close chat"]')!.click());
  expectChatOpen(false);
  expect(overlay.querySelector('textarea')).toBe(composer);
  expect(dock().querySelector('button[aria-label="Open LowDiff chat"]')!.getAttribute('aria-expanded')).toBe('false');
  expect(focusRoot.activeElement).toBe(opener);
  await act(async () => dock().querySelector<HTMLButtonElement>('button[aria-label="Open LowDiff chat"]')!.click());
  const reopened = overlay.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask anything about this PR"]')!;
  expectChatOpen(true);
  expect(reopened).toBe(composer);
  expect(reopened.value).toBe('Could the earlier request win?');
  expect(focusRoot.activeElement).toBe(reopened);
});

it('offers chat from the dock while the first review is still running', async () => {
  annotateReply = () => new Promise(() => {});
  await mount();
  expect(dock().querySelector('[role="status"]')).not.toBeNull();
  const opener = dock().querySelector<HTMLButtonElement>('button[aria-label="Open LowDiff chat"]');
  expect(opener).not.toBeNull();
  expect(overlay.querySelectorAll('button[aria-label="Open LowDiff chat"]')).toHaveLength(1);
  await act(async () => opener!.click());
  expect(document.activeElement).toBe(overlay.querySelector('textarea[aria-label="Ask anything about this PR"]'));
});

it.each([false, true])('toggles chat with the same dock star and retains a draft (shadow: %s)', async inShadow => {
  let focusRoot: Document | ShadowRoot = document;
  if (inShadow) {
    const host = document.createElement('div');
    document.body.append(host);
    focusRoot = host.attachShadow({ mode: 'open' });
    focusRoot.append(overlay);
  }
  await mount();
  const star = dock().querySelector<HTMLButtonElement>('button[aria-label="Open LowDiff chat"]')!;
  expect(star.getAttribute('aria-expanded')).toBe('false');
  await act(async () => star.click());
  const composer = overlay.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask anything about this PR"]')!;
  expect(composer).not.toBeNull();
  expect(focusRoot.activeElement).toBe(composer);
  expect(star.getAttribute('aria-expanded')).toBe('true');
  act(() => {
    composer.value = 'Keep this question while I inspect the diff.';
    composer.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await act(async () => star.click());
  expectChatOpen(false);
  expect(overlay.querySelector('textarea')).toBe(composer);
  expect(star.getAttribute('aria-expanded')).toBe('false');
  expect(star.getAttribute('aria-label')).toBe('Open LowDiff chat');
  expect(focusRoot.activeElement).toBe(star);

  await act(async () => star.click());
  const reopened = overlay.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask anything about this PR"]')!;
  expectChatOpen(true);
  expect(reopened).toBe(composer);
  expect(reopened.value).toBe('Keep this question while I inspect the diff.');
  expect(focusRoot.activeElement).toBe(reopened);
  expect(star.getAttribute('aria-expanded')).toBe('true');
  expect(star.getAttribute('aria-label')).toBe('Hide LowDiff chat');
});

it('keeps a standalone chat button available when a review has no annotations', async () => {
  reviewNotes = [];
  await mount();
  expect(dock()).toBeNull();
  const openers = overlay.querySelectorAll<HTMLButtonElement>('button[aria-label="Open LowDiff chat"]');
  expect(openers).toHaveLength(1);
  await act(async () => openers[0]!.click());
  const composer = overlay.querySelector('textarea[aria-label="Ask anything about this PR"]');
  expect(composer).not.toBeNull();
  expect(document.activeElement).toBe(composer);
  await act(async () => overlay.querySelector<HTMLButtonElement>('button[aria-label="Close chat"]')!.click());
  expectChatOpen(false);
  expect(document.activeElement).toBe(overlay.querySelector('button[aria-label="Open LowDiff chat"]'));
});

it.each([false, true])('keeps the initially closed chat inaccessible without taking page focus (shadow: %s)', async inShadow => {
  if (inShadow) {
    const host = document.createElement('div');
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).append(overlay);
  }
  const pageInput = document.createElement('input');
  document.body.append(pageInput);
  pageInput.focus();
  await mount();
  expect(document.activeElement).toBe(pageInput);
  expectChatOpen(false);
  expect(overlay.querySelector('textarea[aria-label="Ask anything about this PR"]')).not.toBeNull();
});

it.each([false, true])('keeps a rapidly reopened chat active after the previous closing period (shadow: %s)', async inShadow => {
  let focusRoot: Document | ShadowRoot = document;
  if (inShadow) {
    const host = document.createElement('div');
    document.body.append(host);
    focusRoot = host.attachShadow({ mode: 'open' });
    focusRoot.append(overlay);
  }
  await mount();
  const star = dock().querySelector<HTMLButtonElement>('button[aria-label="Open LowDiff chat"]')!;
  await act(async () => star.click());
  const composer = overlay.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask anything about this PR"]')!;
  act(() => {
    composer.value = 'Keep the current question.';
    composer.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => star.click());
  expectChatOpen(false);
  await act(async () => star.click());
  expectChatOpen(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expectChatOpen(true);
  expect(overlay.querySelector('textarea')).toBe(composer);
  expect(composer.value).toBe('Keep the current question.');
  expect(focusRoot.activeElement).toBe(composer);
  expect(star.getAttribute('aria-expanded')).toBe('true');
});
