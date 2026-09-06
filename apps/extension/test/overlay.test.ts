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

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `<table role="grid" aria-label="Diff for: search.ts"><tbody>${rows}</tbody></table>`;
  root = document.createElement('div'); overlay = document.createElement('div');
  document.body.append(root, overlay);
  vi.stubGlobal('chrome', { storage: { onChanged: { addListener: (fn: typeof changeSettings) => { changeSettings = fn; }, removeListener: () => {} } }, runtime: {
    id: 'test',
    sendMessage: async (request: { type: string }) => request.type === 'GET_PUBLIC_SETTINGS'
      ? { ok: true, settings: { configured: true, hiddenKinds: [] } }
      : request.type === 'ANNOTATE' ? { ok: true, notes: [note], summary: 'A race.', cached: true } : { ok: true },
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
  await mount();
  const initialStyles = document.head.querySelectorAll('style').length;
  act(() => [...thread().querySelectorAll('button')].find(b => b.textContent?.includes('Continue in chat'))!.click());
  expect(overlay.textContent).toContain('Cancel earlier requests.');
  expect(overlay.querySelector('textarea')?.placeholder).toContain('Ask anything about this PR');
  act(() => render(null, root));
  expect(document.querySelector('[data-lowdiff-thread]')).toBeNull();
  expect(document.querySelector('[data-lowdiff-badge]')).toBeNull();
  expect(overlay.textContent).toBe('');
  expect(document.head.querySelectorAll('style').length).toBe(initialStyles);
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
