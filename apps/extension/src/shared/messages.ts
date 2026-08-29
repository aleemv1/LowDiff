import type { Note, NoteKind } from '@lowdiff/core';
import type { ProviderId } from '@lowdiff/providers/types';

export interface Settings {
  provider: ProviderId;
  model?: string | undefined;
  githubToken?: string | undefined;
  /** Set per provider; never leaves the service worker. */
  keys: Partial<Record<ProviderId, string>>;
  /**
   * Note kinds hidden from the overlay. Stored as the negative so new kinds
   * added later default to visible instead of silently vanishing.
   */
  hiddenKinds?: NoteKind[] | undefined;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  keys: {},
};

/** Settings safe to expose to the content script — no credentials. */
export interface PublicSettings {
  provider: ProviderId;
  model?: string | undefined;
  configured: boolean;
  hiddenKinds: NoteKind[];
}

export interface PrLocation {
  owner: string;
  repo: string;
  number: number;
}

export type Request =
  | { type: 'GET_PUBLIC_SETTINGS' }
  | { type: 'ANNOTATE'; pr: PrLocation; refresh?: boolean; onlyCached?: boolean }
  | {
      type: 'CHAT';
      pr: PrLocation;
      question: string;
      history: ChatTurn[];
      port: string;
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


export type AnnotateReply = AnnotateOk | { ok: true; idle: true } | Failure;
export type PublicSettingsReply = { ok: true; settings: PublicSettings } | Failure;
