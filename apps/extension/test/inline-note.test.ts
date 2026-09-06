/** @vitest-environment happy-dom */
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Note } from '@lowdiff/core';
import { InlineNote } from '../src/content/components/InlineNote.js';

const note: Note = { kind: 'RISK', title: 'Request race', body: 'Cancel earlier requests.', code: 'ctrl.abort();',
  confidence: 'medium', anchor: { path: 'search.ts', side: 'RIGHT', line: 26, lineHash: 'abc' } };
let root: HTMLDivElement;
let receive: (delta: unknown) => void;
let forwarded: unknown[];
const props = () => ({ note, pr: { owner: 'acme', repo: 'search', number: 412 }, openRequest: 0,
  chatBusy: false, onContinue: (...args: unknown[]) => { forwarded = args; } });
beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  forwarded = [];
  vi.stubGlobal('chrome', { runtime: {
    connect: () => ({ onMessage: { addListener: (fn: typeof receive) => { receive = fn; } },
      onDisconnect: { addListener: () => {} }, disconnect: () => {} }),
    sendMessage: async () => ({ ok: true }),
  } });
});
afterEach(() => { act(() => render(null, root)); root.remove(); vi.unstubAllGlobals(); });
const button = (label: string) => [...root.querySelectorAll('button')].find(b => b.textContent?.includes(label))!;

it('keeps suggested code collapsed until requested and retains the confidence caveat', () => {
  act(() => render(h(InlineNote, props()), root));
  expect(root.querySelector('pre')).toBeNull();
  expect(root.textContent).toContain('Depends on code outside this diff');
  act(() => button('Show suggested fix').click());
  expect(root.querySelector('pre')?.textContent).toBe('ctrl.abort();');
});

it('opens quieter findings when selected by their badge', () => {
  const p = { ...props(), note: { ...note, kind: 'BREAKING' as const } };
  act(() => render(h(InlineNote, p), root));
  expect(root.querySelector('textarea')).toBeNull();
  act(() => render(h(InlineNote, { ...p, openRequest: 1 }), root));
  expect(root.querySelector('textarea')).not.toBeNull();
});

it('streams a follow-up and carries its context to chat', () => {
  act(() => render(h(InlineNote, props()), root));
  const input = root.querySelector('textarea')!;
  act(() => { input.value = 'Does debounce prevent this?'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  act(() => root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  act(() => receive({ type: 'text', text: 'Earlier requests can finish last.' }));
  expect(root.textContent).toContain('Earlier requests can finish last.');
  expect(button('Continue in chat').disabled).toBe(true);
  act(() => receive({ type: 'done' }));
  act(() => button('Continue in chat').click());
  expect(JSON.stringify(forwarded)).toContain('search.ts:26');
  expect(JSON.stringify(forwarded)).toContain('Does debounce prevent this?');
  expect(JSON.stringify(forwarded)).toContain('Earlier requests can finish last.');
});

it('stops GitHub hotkeys while composing', () => {
  act(() => render(h(InlineNote, props()), root));
  let bubbled = false;
  const onKey = () => { bubbled = true; };
  document.addEventListener('keydown', onKey);
  root.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: '.', bubbles: true }));
  document.removeEventListener('keydown', onKey);
  expect(bubbled).toBe(false);
});
