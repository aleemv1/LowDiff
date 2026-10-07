import type { ChatTurn, PrLocation } from '../shared/messages.js';

export interface ConversationState {
  messages: ChatTurn[];
  busy: boolean;
  activity: string | null;
  usage: string | null;
  error: string | null;
}

export class Conversation {
  snapshot: ConversationState = { messages: [], busy: false, activity: null, usage: null, error: null };
  private listeners = new Set<() => void>();
  private disposed = false;
  private close: (() => void) | null = null;
  private imported = new Map<string, ChatTurn[]>();
  private activeThread: string | null = null;
  constructor(private pr: PrLocation, private seed: ChatTurn[] = []) {}
  get history(): ChatTurn[] { return [...this.seed, ...this.snapshot.messages]; }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<ConversationState>): void {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  send(question: string): boolean {
    question = question.trim();
    if (!question || this.snapshot.busy || this.disposed) return false;
    const history = this.history;
    const messages: ChatTurn[] = [...this.snapshot.messages, { role: 'user', content: question }];
    this.update({ messages, busy: true, activity: null, usage: null, error: null });
    let ended = false;
    let port: chrome.runtime.Port | undefined;
    const finish = (error: string | null = null) => {
      if (ended) return;
      ended = true;
      this.close = null;
      this.update({ busy: false, activity: null, error });
      try { port?.disconnect(); } catch { /* The extension may have reloaded. */ }
    };
    this.close = () => finish();
    try {
      const portName = `lowdiff-chat:${crypto.randomUUID()}`;
      port = chrome.runtime.connect({ name: portName });
      let answer = '';
      port.onDisconnect.addListener(() => finish('Chat connection closed before the answer finished. Please try again.'));
      port.onMessage.addListener((delta: {
        type: string; text?: string; error?: string; label?: string;
        inputTokens?: number; outputTokens?: number; rounds?: number;
      }) => {
        if (ended || this.disposed) return;
        if (delta.type === 'text' && delta.text) {
          answer += delta.text;
          this.update({ messages: [...messages, { role: 'assistant', content: answer }], activity: null });
        } else if (delta.type === 'tool') {
          this.update({ activity: delta.label ?? 'Working…' });
        } else if (delta.type === 'usage') {
          const tokens = `${((delta.inputTokens ?? 0) / 1000).toFixed(1)}k in / ${delta.outputTokens ?? 0} out`;
          // Preserve the existing chat's approximate spend visibility.
          const dollars = ((delta.inputTokens ?? 0) * 5 + (delta.outputTokens ?? 0) * 25) / 1e6;
          this.update({ usage: `${delta.rounds ? `${delta.rounds} search${delta.rounds === 1 ? '' : 'es'} · ` : ''}${tokens} ≈ $${dollars.toFixed(3)}` });
        } else if (delta.type === 'error') {
          finish(delta.error ?? 'Unable to answer. Please try again.');
        } else if (delta.type === 'done') {
          finish();
        }
      });
      void Promise.resolve(chrome.runtime.sendMessage({ type: 'CHAT', pr: this.pr, question, history, port: portName }))
        .then((reply: { ok?: boolean; error?: string } | undefined) => {
          if (reply?.ok === false) finish(reply.error ?? 'Unable to start chat.');
        }).catch((error: unknown) => finish(error instanceof Error ? error.message : String(error)));
    } catch (error) {
      finish(error instanceof Error ? error.message : String(error));
    }
    return true;
  }

  /** Continue an inline conversation without issuing another billed request. */
  append(messages: ChatTurn[]): void {
    if (this.snapshot.busy || this.disposed) return;
    this.update({ messages: [...this.snapshot.messages, ...messages], error: null });
  }

  continueThread(key: string, history: ChatTurn[]): void {
    if (this.snapshot.busy || this.disposed) return;
    const previous = this.imported.get(key) ?? [];
    const samePrefix = previous.length <= history.length && previous.every((turn, index) =>
      turn.role === history[index]!.role && turn.content === history[index]!.content);
    const newTurns = samePrefix ? history.slice(previous.length) : history;
    // Re-establish the finding context if other sidebar discussions intervened.
    const context: ChatTurn[] = previous.length > 0 && samePrefix && history[0] &&
      (newTurns.length > 0 || this.activeThread !== key)
      ? [{ role: 'user', content: `Returning to this finding: ${history[0].content}` }]
      : [];
    if (context.length || newTurns.length) this.append([...context, ...newTurns]);
    this.activeThread = key;
    this.imported.set(key, [...history]);
  }

  dispose(): void {
    this.close?.();
    this.disposed = true;
    this.listeners.clear();
  }
}
