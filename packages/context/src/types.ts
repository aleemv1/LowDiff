import type { FileDiff, PrRef, RepoRef } from '@lowdiff/core';

export interface CodeHit {
  repo: RepoRef;
  path: string;
  line: number;
  text: string;
}

export interface PrMeta {
  title: string;
  body: string;
  headSha: string;
}

/**
 * Everything LowDiff needs to read about a repository.
 *
 * v1 ships the GitHub REST implementation. The local daemon slots in behind
 * this same interface in v2 to make cross-repo search real — the annotation
 * engine and the overlay never learn which one they're talking to.
 */
export interface ContextProvider {
  getPr(pr: Omit<PrRef, 'headSha'>): Promise<PrMeta>;
  getDiff(pr: PrRef): Promise<FileDiff[]>;
  searchCode(query: string, repos: RepoRef[]): Promise<CodeHit[]>;
  getFile(repo: RepoRef, path: string, ref: string): Promise<string>;
}
