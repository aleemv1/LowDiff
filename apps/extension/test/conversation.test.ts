import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Conversation } from '../src/content/conversation.js';

let receive: (message: unknown) => void;
let disconnect: () => void;
const requests: any[] = [];
const pr = { owner: 'acme', repo: 'search', number: 412 };
const seed = [{ role: 'user' as const, content: 'Discuss the risk at search.ts:26.' }];

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal('chrome', { runtime: {
    connect: () => ({
      onMessage: { addListener: (fn: typeof receive) => { receive = fn; } },
      onDisconnect: { addListener: (fn: typeof disconnect) => { disconnect = fn; } },
      disconnect: () => disconnect?.(),
    }),
    sendMessage: async (request: unknown) => { requests.push(request); return { ok: true }; },
  } });
});
afterEach(() => vi.unstubAllGlobals());

it('streams one answer and prevents duplicate sends until done', () => {
  const chat = new Conversation(pr, seed);
  expect(chat.send('Why?')).toBe(true);
  receive({ type: 'text', text: 'A slow ' });
  expect(chat.snapshot.busy).toBe(true);
  expect(chat.send('another question')).toBe(false);
  receive({ type: 'text', text: 'request wins.' });
  expect(chat.snapshot.messages).toEqual([
    { role: 'user', content: 'Why?' }, { role: 'assistant', content: 'A slow request wins.' },
  ]);
  receive({ type: 'done' });
  expect(chat.snapshot.busy).toBe(false);
});

it('sends the selected finding and prior conversation as context', () => {
  const chat = new Conversation(pr, seed);
  chat.send('Why?');
  receive({ type: 'text', text: 'A race.' });
  receive({ type: 'done' });
  chat.send('How do I fix it?');
  expect(requests[1].history).toEqual([
    ...seed, { role: 'user', content: 'Why?' }, { role: 'assistant', content: 'A race.' },
  ]);
  expect(requests[1].question).toBe('How do I fix it?');
  expect(requests[0].port).not.toBe(requests[1].port);
});

it('can continue an inline thread in the sidebar without a new request', () => {
  const inline = new Conversation(pr, seed);
  inline.send('Why?');
  receive({ type: 'text', text: 'A race.' });
  receive({ type: 'done' });
  const sidebar = new Conversation(pr);
  sidebar.append(inline.history);
  expect(sidebar.snapshot.messages).toEqual([
    ...seed, { role: 'user', content: 'Why?' }, { role: 'assistant', content: 'A race.' },
  ]);
  expect(requests).toHaveLength(1);
});

it('reports premature disconnection and permits a later retry', () => {
  const chat = new Conversation(pr);
  chat.send('Why?');
  disconnect();
  expect(chat.snapshot.busy).toBe(false);
  expect(chat.snapshot.error).toMatch(/connection/i);
  expect(chat.send('Try again')).toBe(true);
});

it('handles request failures before streaming starts', async () => {
  chrome.runtime.sendMessage = vi.fn().mockRejectedValue(new Error('Extension reloaded'));
  const chat = new Conversation(pr);
  chat.send('Why?');
  await Promise.resolve();
  await Promise.resolve();
  expect(chat.snapshot.busy).toBe(false);
  expect(chat.snapshot.error).toContain('Extension reloaded');
});

it('ignores late stream events after the view is disposed', () => {
  const chat = new Conversation(pr);
  chat.send('Why?');
  chat.dispose();
  const before = chat.snapshot;
  receive({ type: 'text', text: 'Late response' });
  expect(chat.snapshot).toBe(before);
  expect(chat.send('Again')).toBe(false);
});

it('imports only new inline turns when continuing the same finding again', () => {
  const sidebar = new Conversation(pr);
  const history = [...seed, { role: 'assistant' as const, content: 'A race.' }];
  sidebar.continueThread('finding-1', history);
  sidebar.continueThread('finding-1', history);
  expect(sidebar.snapshot.messages).toEqual(history);
  sidebar.continueThread('finding-1', [...history,
    { role: 'user', content: 'How?' }, { role: 'assistant', content: 'Cancel.' },
  ]);
  expect(sidebar.snapshot.messages.filter(m => m.content === 'A race.')).toHaveLength(1);
  expect(sidebar.snapshot.messages.at(-1)?.content).toBe('Cancel.');
});

it('restores context when returning to an earlier finding without repeating its transcript', () => {
  const sidebar = new Conversation(pr);
  sidebar.continueThread('risk', seed);
  sidebar.continueThread('breaking', [{ role: 'user', content: 'Discuss the API change at client.ts:59.' }]);
  sidebar.continueThread('risk', seed);
  expect(sidebar.snapshot.messages.at(-1)?.content).toContain('search.ts:26');
  expect(sidebar.snapshot.messages.filter(m => m.content === seed[0]!.content)).toHaveLength(1);
  const count = sidebar.snapshot.messages.length;
  sidebar.continueThread('risk', seed);
  expect(sidebar.snapshot.messages).toHaveLength(count);
});
