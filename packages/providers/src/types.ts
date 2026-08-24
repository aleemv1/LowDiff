import type { FileDiff, Mode, Note, PrRef } from '@lowdiff/core';

export type ProviderId = 'anthropic' | 'openai' | 'google';

/**
 * How we authenticate to a provider.
 *
 * Anthropic is `apiKey` only — their Feb 2026 policy restricts subscription
 * OAuth to Claude Code and claude.ai, so a third-party OAuth path is not
 * available to us. Google supports real OAuth; OpenAI's device-code flow is
 * gated on their approval.
 */
export type Auth =
  | { kind: 'apiKey'; key: string }
  | { kind: 'oauth'; accessToken: string; refreshToken: string; expiresAt: number };

export interface ProviderConfig {
  provider: ProviderId;
  auth: Auth;
  /** Overrides the provider's default model. */
  model?: string;
}

export interface AnnotateRequest {
  mode: Mode;
  pr: PrRef;
  title: string;
  body: string;
  files: FileDiff[];
  signal?: AbortSignal;
}

export interface AnnotateResponse {
  summary: string;
  /** Raw, unanchored. The caller grounds these with `anchorNotes`. */
  notes: import('@lowdiff/core').RawNote[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  pr: PrRef;
  title: string;
  body: string;
  files: FileDiff[];
  /** The review summary already shown to the user, so chat can build on it. */
  summary: string;
  /** The grounded notes, so "Ask about this" refers to something the model sees. */
  notes: Note[];
  history: ChatMessage[];
  question: string;
  signal?: AbortSignal;
}

export type ChatDelta = { type: 'text'; text: string } | { type: 'done' };

export interface LlmClient {
  readonly provider: ProviderId;
  readonly model: string;
  annotate(req: AnnotateRequest): Promise<AnnotateResponse>;
  chat(req: ChatRequest): AsyncIterable<ChatDelta>;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5.5',
  google: 'gemini-3.7-flash',
};
