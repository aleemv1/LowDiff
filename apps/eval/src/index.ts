#!/usr/bin/env tsx
/**
 * Measures whether the review is accurate, on cases with known answers.
 *
 * Two numbers matter and they pull against each other: how many planted
 * defects are found, and how often a clean diff draws a note anyway. Detection
 * rate alone is trivially gamed by flagging everything, which is precisely the
 * failure that makes a review tool unusable.
 *
 *   tsx src/index.ts [--provider anthropic|openai|google] [--env path] [--runs 1]
 */
import { readFileSync } from 'node:fs';
import { anchorNotes, parsePatch } from '@lowdiff/core';
import type { FileDiff, Note } from '@lowdiff/core';
import { createLlmClient } from '@lowdiff/providers';
import type { ProviderId } from '@lowdiff/providers/types';
import { CASES } from './cases.js';
import type { EvalCase } from './cases.js';

const KEY_VARS: Record<ProviderId, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY', 'GPT_API_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
};

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const OFF = '\x1b[0m';

function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function loadEnvFile(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
}

function toFiles(c: EvalCase): FileDiff[] {
  return [
    { path: c.path, status: 'modified', additions: 0, deletions: 0, hunks: parsePatch(c.patch) },
  ];
}

/**
 * Located: the note covers the planted defect's line.
 *
 * Allows a line either side, because a defect can legitimately be anchored to
 * the line that introduces it or the line that suffers from it.
 */
function locates(c: EvalCase, note: Note): boolean {
  if (!c.expect) return false;
  const from = note.anchor.line;
  const to = note.anchor.endLine ?? note.anchor.line;
  return c.expect.line >= from - 1 && c.expect.line <= to + 1;
}

/**
 * Classified: located *and* labelled with the kind we expected.
 *
 * Tracked separately from location because the two failures are not equally
 * bad. A defect found and labelled SECURITY where we expected RISK still puts
 * the right warning on the right line; a defect not found at all does not.
 */
function classifies(c: EvalCase, note: Note): boolean {
  return locates(c, note) && (c.expect?.kind.includes(note.kind) ?? false);
}

interface Result {
  id: string;
  planted: boolean;
  located: boolean;
  classified: boolean;
  notes: Note[];
  ungrounded: number;
}

async function main(): Promise<void> {
  loadEnvFile(flag('env', '../../.env')!);
  const provider = (flag('provider', 'anthropic') as ProviderId) ?? 'anthropic';
  const runs = Number(flag('runs', '1'));

  const key = KEY_VARS[provider].map((v) => process.env[v]).find(Boolean);
  if (!key) {
    console.error(`Set one of ${KEY_VARS[provider].join(' / ')}`);
    process.exit(1);
  }

  const llm = createLlmClient({ provider, auth: { kind: 'apiKey', key } });
  console.log(`${BOLD}LowDiff review eval${OFF} ${DIM}· ${llm.provider}/${llm.model} · ${CASES.length} cases × ${runs}${OFF}\n`);

  const results: Result[] = [];

  for (let run = 1; run <= runs; run++) {
    // Cases are independent, so run them together rather than in sequence.
    const batch = await Promise.all(
      CASES.map(async (c): Promise<Result> => {
        const files = toFiles(c);
        const out = await llm.annotate({
          pr: { owner: 'eval', repo: 'cases', number: 1, headSha: c.id },
          title: c.title,
          body: c.body,
          files,
        });
        const grounded = anchorNotes(out.notes, files);
        return {
          id: c.id,
          planted: c.expect !== null,
          located: grounded.some((n) => locates(c, n)),
          classified: grounded.some((n) => classifies(c, n)),
          notes: grounded,
          ungrounded: out.notes.length - grounded.length,
        };
      }),
    );

    for (const r of batch) {
      const c = CASES.find((x) => x.id === r.id)!;
      const label = r.planted
        ? r.classified
          ? `${GREEN}FOUND ${OFF}`
          : r.located
            ? `${YELLOW}MISLBL${OFF}`
            : `${RED}MISSED${OFF}`
        : r.notes.length === 0
          ? `${GREEN}QUIET ${OFF}`
          : `${YELLOW}NOISY ${OFF}`;

      console.log(`${label} ${r.id.padEnd(20)} ${DIM}${r.notes.length} notes${r.ungrounded ? `, ${r.ungrounded} ungrounded` : ''}${OFF}`);
      for (const n of r.notes) {
        const mark = r.planted && classifies(c, n) ? '✓' : r.planted && locates(c, n) ? '~' : ' ';
        console.log(`   ${mark} ${DIM}[${n.kind}] ${n.anchor.path}:${n.anchor.line}${n.anchor.endLine ? `-${n.anchor.endLine}` : ''} — ${n.title}${OFF}`);
      }
      results.push(r);
    }
  }

  const planted = results.filter((r) => r.planted);
  const controls = results.filter((r) => !r.planted);
  const located = planted.filter((r) => r.located).length;
  const classified = planted.filter((r) => r.classified).length;
  const noisy = controls.filter((r) => r.notes.length > 0).length;
  const controlNotes = controls.reduce((n, r) => n + r.notes.length, 0);
  const ungrounded = results.reduce((n, r) => n + r.ungrounded, 0);

  const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`);

  console.log(`\n${BOLD}Summary${OFF}`);
  console.log(`  Located        ${located}/${planted.length}  ${pct(located, planted.length)}  ${DIM}defect found on the right line${OFF}`);
  console.log(`  Classified     ${classified}/${planted.length}  ${pct(classified, planted.length)}  ${DIM}and labelled the kind we expected${OFF}`);
  console.log(`  Clean & quiet  ${controls.length - noisy}/${controls.length}  ${pct(controls.length - noisy, controls.length)}`);
  console.log(`  Notes on clean diffs: ${controlNotes}`);
  console.log(`  Ungrounded notes dropped: ${ungrounded}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
