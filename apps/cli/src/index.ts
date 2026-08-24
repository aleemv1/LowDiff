#!/usr/bin/env tsx
/**
 * Runs the real annotation pipeline against a pull request and prints the
 * result. Same code paths the extension uses, minus Chrome — which makes this
 * the fastest way to check whether the notes are any good.
 *
 *   lowdiff <pr-url> [--mode review|explain] [--provider anthropic|openai|google]
 *   lowdiff <pr-url> --chat "why 300ms?"
 */
import { readFileSync } from 'node:fs';
import { anchorNotes } from '@lowdiff/core';
import type { Mode } from '@lowdiff/core';
import { DaemonClient, GitHubContextProvider, parsePrUrl } from '@lowdiff/context';
import { createLlmClient } from '@lowdiff/providers';
import type { ProviderId } from '@lowdiff/providers/types';

const KEY_VARS: Record<ProviderId, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY', 'GPT_API_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
};

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const OFF = '\x1b[0m';
const KIND_COLOR: Record<string, string> = {
  RISK: '\x1b[31m',
  SECURITY: '\x1b[31m',
  BREAKING: '\x1b[33m',
  PERF: '\x1b[34m',
  SUGGESTION: '\x1b[32m',
  EXPLAIN: '\x1b[90m',
};

function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

/** Load KEY=VALUE pairs from a .env file without adding a dependency. */
function loadEnvFile(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2]!.replace(/^["']|["']$/g, '');
    if (!process.env[match[1]!]) process.env[match[1]!] = value;
  }
}

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url || url.startsWith('--')) {
    console.error('usage: lowdiff <pr-url> [--mode review|explain] [--provider <id>] [--env <path>]');
    process.exit(1);
  }

  const envPath = flag('env');
  if (envPath) loadEnvFile(envPath);

  const mode = (flag('mode', 'review') as Mode) ?? 'review';
  const provider = (flag('provider', 'anthropic') as ProviderId) ?? 'anthropic';

  const location = parsePrUrl(url);
  if (!location) {
    console.error(`Not a GitHub pull request URL: ${url}`);
    process.exit(1);
  }

  const key = KEY_VARS[provider].map((v) => process.env[v]).find(Boolean);
  if (!key) {
    console.error(`Set one of ${KEY_VARS[provider].join(' / ')} for provider "${provider}".`);
    process.exit(1);
  }

  const github = new GitHubContextProvider(
    process.env['GITHUB_TOKEN'] ? { token: process.env['GITHUB_TOKEN'] } : {},
  );

  process.stderr.write(`${DIM}Fetching ${location.owner}/${location.repo}#${location.number}…${OFF}\n`);
  const meta = await github.getPr(location);
  const files = await github.getDiff({ ...location, headSha: meta.headSha });
  const withDiff = files.filter((f) => f.hunks.length > 0);
  const lines = withDiff.reduce((n, f) => n + f.hunks.reduce((m, h) => m + h.lines.length, 0), 0);

  process.stderr.write(
    `${DIM}${withDiff.length} files, ${lines} diff lines — running ${provider} in ${mode} mode…${OFF}\n\n`,
  );

  const llm = createLlmClient({ provider, auth: { kind: 'apiKey', key } });
  const started = Date.now();
  const result = await llm.annotate({
    mode,
    pr: { ...location, headSha: meta.headSha },
    title: meta.title,
    body: meta.body,
    files: withDiff,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const grounded = anchorNotes(result.notes, withDiff);
  const dropped = result.notes.length - grounded.length;

  console.log(`${BOLD}${meta.title}${OFF}  ${DIM}${url}${OFF}\n`);
  console.log(result.summary + '\n');

  if (grounded.length === 0) {
    console.log(`${DIM}(no notes)${OFF}\n`);
  }
  for (const note of grounded) {
    const color = KIND_COLOR[note.kind] ?? '';
    console.log(
      `${color}${BOLD}${note.kind}${OFF}  ${BOLD}${note.title}${OFF}\n` +
        `${DIM}${note.anchor.path}:${note.anchor.line} (${note.anchor.side}, ${note.confidence})${OFF}\n` +
        `  ${note.body.replace(/\n/g, '\n  ')}\n` +
        (note.code ? `${DIM}  ${note.code.replace(/\n/g, '\n  ')}${OFF}\n` : ''),
    );
  }

  const cost =
    provider === 'anthropic'
      ? ` ≈ $${((result.usage.inputTokens * 5 + result.usage.outputTokens * 25) / 1e6).toFixed(3)}`
      : '';
  console.log(
    `${DIM}${grounded.length} notes${dropped ? `, ${dropped} dropped as ungrounded` : ''} · ` +
      `${result.usage.inputTokens} in / ${result.usage.outputTokens} out${cost} · ${elapsed}s${OFF}`,
  );

  // Exercises the same chat path the extension uses, with the review it just
  // produced as context — the extension passes its cached review the same way.
  const question = flag('chat');
  if (!question) return;

  // With LOWDIFF_DAEMON_TOKEN set and the daemon running, chat can search
  // registered repos — the same path the extension uses.
  let tools;
  const daemonToken = process.env['LOWDIFF_DAEMON_TOKEN'];
  if (daemonToken) {
    const daemon = new DaemonClient({ token: daemonToken });
    const repoNames = await daemon.health();
    if (repoNames && repoNames.length > 0) {
      tools = {
        repoNames,
        search: (q: string, repo?: string) => daemon.search(q, repo),
        read: (repo: string, path: string, startLine?: number) => daemon.read(repo, path, startLine),
      };
      process.stderr.write(`${DIM}repo search on: ${repoNames.join(', ')}${OFF}\n`);
    }
  }

  console.log(`\n${BOLD}> ${question}${OFF}\n`);
  for await (const delta of llm.chat({
    pr: { ...location, headSha: meta.headSha },
    title: meta.title,
    body: meta.body,
    files: withDiff,
    summary: result.summary,
    notes: grounded,
    history: [],
    question,
    ...(tools ? { tools } : {}),
  })) {
    if (delta.type === 'text') process.stdout.write(delta.text);
    else if (delta.type === 'tool') process.stderr.write(`${DIM}  ⚙ ${delta.label}${OFF}\n`);
    else if (delta.type === 'usage') {
      const dollars = ((delta.inputTokens * 5 + delta.outputTokens * 25) / 1e6).toFixed(3);
      process.stderr.write(
        `\n${DIM}${delta.rounds} tool rounds · ${delta.inputTokens} in / ${delta.outputTokens} out ≈ $${dollars}${OFF}\n`,
      );
    }
  }
  console.log('\n');
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
