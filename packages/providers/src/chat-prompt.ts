import { renderDiff } from '@lowdiff/core';
import type { Note } from '@lowdiff/core';
import type { ChatRequest } from './types.js';

/**
 * Rendered diffs are capped so one enormous pull request cannot blow the
 * context window. Truncation is always announced in the prompt — a model that
 * silently receives half a diff will answer confidently about code it never
 * saw.
 */
export const MAX_DIFF_CHARS = 120_000;

function renderNotes(notes: readonly Note[]): string {
  if (notes.length === 0) return 'No findings were reported for this pull request.';
  return notes
    .map(
      (n) =>
        `- [${n.kind}] ${n.anchor.path}:${n.anchor.line} — ${n.title}\n  ${n.body}`,
    )
    .join('\n');
}

/**
 * Everything that stays the same across a conversation about one pull request:
 * the rules, the PR metadata, the diff, and the review already produced.
 *
 * This lives in the system prompt rather than the latest user message so it
 * forms a stable cacheable prefix — putting the diff after the history would
 * move it on every turn and defeat caching entirely.
 */
export function chatSystemPrompt(req: ChatRequest): string {
  const diff = renderDiff(req.files);
  const truncated = diff.length > MAX_DIFF_CHARS;
  const shown = truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff;

  return `You answer questions about one specific GitHub pull request. The full diff and
your earlier review of it are below.

- Ground every claim in the diff. If the answer depends on code you were not
  shown, say so rather than guessing.
- Cite locations as path:line when referring to specific code.
- Be brief. Answer the question asked; do not summarise the whole PR.
- When the question refers to one of your findings, build on it rather than
  repeating it back.

PULL REQUEST ${req.pr.owner}/${req.pr.repo}#${req.pr.number}
Title: ${req.title}

Description:
${req.body.trim() || '(no description)'}

YOUR REVIEW OF THIS PULL REQUEST
${req.summary.trim() || '(no summary)'}

Findings:
${renderNotes(req.notes)}

DIFF
Columns are: left line, right line, marker, content.

${shown}${truncated ? `\n\n[diff truncated at ${MAX_DIFF_CHARS} characters — later files are not shown, so do not answer questions about them]` : ''}`;
}

/** Just the question: everything stable lives in the system prompt. */
export function chatUserPrompt(req: ChatRequest): string {
  return req.question;
}
