import type { Mode, Note, NoteKind } from '@lowdiff/core';
import type { ProviderId } from '@lowdiff/providers/types';

export interface Settings {
  provider: ProviderId;
  model?: string | undefined;
  githubToken?: string | undefined;
  /** Token printed by lowdiff-daemon; enables repo search in chat. */
  daemonToken?: string | undefined;
  /** Set per provider; never leaves the service worker. */
  keys: Partial<Record<ProviderId, string>>;
  /**
   * Bill the Google account connected via chrome.identity instead of a key.
   * Tokens are minted on demand and never stored by LowDiff.
   */
  googleAccount?: boolean | undefined;
  /**
   * OAuth client id for OpenAI's device-code flow. Third-party access is
   * gated on OpenAI's approval, so this stays empty for most users.
   */
  openaiClientId?: string | undefined;
  /** Tokens from the OpenAI device flow; refreshed in the worker. */
  openaiTokens?:
    | { accessToken: string; refreshToken: string; expiresAt: number }
    | undefined;
  defaultMode: Mode;
  /**
   * Note kinds hidden from the overlay. Stored as the negative so new kinds
   * added later default to visible instead of silently vanishing.
   */
  hiddenKinds?: NoteKind[] | undefined;
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
  hiddenKinds: NoteKind[];
}

export interface PrLocation {
  owner: string;
  repo: string;
  number: number;
}

export type Request =
  | { type: 'GET_PUBLIC_SETTINGS' }
  | { type: 'ANNOTATE'; pr: PrLocation; refresh?: boolean }
  | {
      type: 'CHAT';
      pr: PrLocation;
      question: string;
      history: ChatTurn[];
      port: string;
    }
  | { type: 'ADD_REPO'; path: string }
  | { type: 'LIST_REPOS' }
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

export type ReposReply = { ok: true; repos: string[] } | Failure;

export type AnnotateReply = AnnotateOk | Failure;
export type PublicSettingsReply = { ok: true; settings: PublicSettings } | Failure;
