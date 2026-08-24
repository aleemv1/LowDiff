import type { NoteKind } from '@lowdiff/core';

export interface EvalCase {
  id: string;
  title: string;
  body: string;
  path: string;
  patch: string;
  /**
   * The defect planted in this diff, or null for a control.
   *
   * Controls are correct changes that a reviewer should pass in silence. They
   * are the half of the measurement that catches a model which flags
   * everything — detection rate alone is trivially gamed by never staying
   * quiet.
   */
  expect: { kind: NoteKind[]; line: number; what: string } | null;
}

export const CASES: EvalCase[] = [
  {
    id: 'sql-injection',
    title: 'feat: filter users by name',
    body: 'Adds a search filter.',
    path: 'src/db/users.py',
    patch: [
      '@@ -10,5 +10,7 @@ def find_users(conn, name):',
      ' def find_users(conn, name):',
      '-    cur = conn.execute("SELECT * FROM users")',
      '-    return cur.fetchall()',
      '+    query = "SELECT * FROM users WHERE name = \'" + name + "\'"',
      '+    cur = conn.execute(query)',
      '+    return cur.fetchall()',
      ' ',
      ' def count_users(conn):',
    ].join('\n'),
    expect: { kind: ['SECURITY'], line: 12, what: 'SQL injection via string concatenation' },
  },
  {
    id: 'hardcoded-secret',
    title: 'chore: wire up the metrics client',
    body: '',
    path: 'src/metrics.ts',
    patch: [
      '@@ -3,4 +3,6 @@ import { Client } from "./client";',
      ' import { Client } from "./client";',
      ' ',
      '-export const metrics = new Client({ endpoint: process.env.METRICS_URL });',
      '+export const metrics = new Client({',
      '+  endpoint: process.env.METRICS_URL,',
      '+  apiKey: "sk_live_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c",',
      '+});',
    ].join('\n'),
    expect: { kind: ['SECURITY'], line: 8, what: 'hardcoded live API key' },
  },
  {
    id: 'missing-await',
    title: 'fix: persist the session before redirect',
    body: 'Fixes flaky logout.',
    path: 'src/auth/session.ts',
    patch: [
      '@@ -20,4 +20,5 @@ export async function logout(req: Request) {',
      ' export async function logout(req: Request) {',
      '-  await store.destroy(req.sessionId);',
      '+  store.destroy(req.sessionId);',
      '   return redirect("/login");',
      ' }',
    ].join('\n'),
    // SECURITY is also accepted: a session that survives logout is usable
    // by whoever holds the cookie, which meets the attacker-involvement
    // test the review prompt defines.
    expect: { kind: ['RISK', 'SECURITY'], line: 22, what: 'await removed, so destroy races the redirect' },
  },
  {
    id: 'breaking-signature',
    title: 'refactor: simplify the public render API',
    body: '',
    path: 'src/index.ts',
    patch: [
      '@@ -40,4 +40,4 @@ export function render(',
      ' export function render(',
      '-  tree: Node, target: Element, options?: RenderOptions,',
      '+  tree: Node, target: Element,',
      ' ): void {',
    ].join('\n'),
    expect: { kind: ['BREAKING'], line: 42, what: 'removed a parameter from an exported function' },
  },
  {
    id: 'null-deref',
    title: 'feat: show the author name on cards',
    body: '',
    path: 'src/ui/Card.tsx',
    patch: [
      '@@ -12,3 +12,4 @@ export function Card({ post }: Props) {',
      ' export function Card({ post }: Props) {',
      '+  const initials = post.author.name.slice(0, 2).toUpperCase();',
      '   return <div>{post.title}</div>;',
    ].join('\n'),
    expect: {
      kind: ['RISK'],
      line: 13,
      what: 'author may be absent, so .name throws',
    },
  },
  {
    id: 'unbounded-loop',
    title: 'perf: retry the upload on failure',
    body: '',
    path: 'src/upload.ts',
    patch: [
      '@@ -8,4 +8,8 @@ export async function upload(file: Blob) {',
      ' export async function upload(file: Blob) {',
      '+  while (true) {',
      '+    const res = await post(file);',
      '+    if (res.ok) return res;',
      '+  }',
      ' }',
    ].join('\n'),
    expect: { kind: ['RISK'], line: 9, what: 'retry loop with no bound or backoff' },
  },

  // --- controls: correct changes that should draw no review notes ----------
  {
    id: 'control-rename',
    title: 'refactor: clearer local name',
    body: '',
    path: 'src/util/sum.ts',
    patch: [
      '@@ -2,5 +2,5 @@ export function total(values: number[]): number {',
      ' export function total(values: number[]): number {',
      '-  let s = 0;',
      '-  for (const v of values) s += v;',
      '-  return s;',
      '+  let running = 0;',
      '+  for (const value of values) running += value;',
      '+  return running;',
      ' }',
    ].join('\n'),
    expect: null,
  },
  {
    id: 'control-test',
    title: 'test: cover the empty case',
    body: '',
    path: 'src/util/sum.test.ts',
    patch: [
      '@@ -5,3 +5,7 @@ describe("total", () => {',
      '   it("adds numbers", () => {',
      '     expect(total([1, 2])).toBe(3);',
      '   });',
      '+',
      '+  it("returns zero for an empty list", () => {',
      '+    expect(total([])).toBe(0);',
      '+  });',
    ].join('\n'),
    expect: null,
  },
  {
    id: 'control-docs',
    title: 'docs: explain the retry policy',
    body: '',
    path: 'README.md',
    patch: [
      '@@ -14,2 +14,5 @@ Uploads are retried.',
      ' Uploads are retried.',
      '+',
      '+Retries use exponential backoff starting at 250ms, capped at five',
      '+attempts. A failure after that surfaces to the caller.',
    ].join('\n'),
    expect: null,
  },
  {
    id: 'control-types',
    title: 'chore: annotate the return type',
    body: '',
    path: 'src/util/slug.ts',
    patch: [
      '@@ -1,3 +1,3 @@',
      '-export function slug(input) {',
      '+export function slug(input: string): string {',
      '   return input.trim().toLowerCase().replace(/\\s+/g, "-");',
      ' }',
    ].join('\n'),
    expect: null,
  },
];
