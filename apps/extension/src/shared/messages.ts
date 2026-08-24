import type { Mode, Note } from '@lowdiff/core';
import type { ProviderId } from '@lowdiff/providers/types';

export interface Settings {
  provider: ProviderId;
  model?: string | undefined;
  githubToken?: string | undefined;
  /** Set per provider; never leaves the service worker. */
  keys: Partial<Record<ProviderId, string>>;
  defaultMode: Mode;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  keys: {},
  defaultMode: 'review',
};

/** Settings safe to expose to the content script — no credentials. */
export interface PublicSettings {
  provider: ProviderId;
  model?: string | undefined;
  defaultMode: Mode;
  configured: boolean;
}

export interface PrLocation {
  owner: string;
  repo: string;
  number: number;
}

export type Request =
  | { type: 'GET_PUBLIC_SETTINGS' }
  | { type: 'ANNOTATE'; pr: PrLocation; mode: Mode; refresh?: boolean }
  | {
      type: 'CHAT';
      pr: PrLocation;
      question: string;
      history: ChatTurn[];
      port: string;
      mode: Mode;
    }
  | { type: 'OPEN_OPTIONS' };

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnnotateOk {
  ok: true;
  summary: string;
  notes: Note[];
  headSha: string;
  cached: boolean;
  usage: { inputTokens: number; outputTokens: number };
}

export interface Failure {
  ok: false;
  error: string;
}

export type AnnotateReply = AnnotateOk | Failure;
export type PublicSettingsReply = { ok: true; settings: PublicSettings } | Failure;
