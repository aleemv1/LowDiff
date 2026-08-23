import { renderDiff } from '@lowdiff/core';
import type { ChatRequest } from './types.js';

export function chatSystemPrompt(): string {
  return `You answer questions about a specific GitHub pull request. You are shown the
full diff.

- Ground every claim in the diff. If the answer depends on code you were not
  shown, say so rather than guessing.
- Cite locations as path:line when referring to specific code.
- Be brief. Answer the question asked; do not summarise the whole PR.`;
}

export function chatUserPrompt(req: ChatRequest): string {
  return `Pull request ${req.pr.owner}/${req.pr.repo}#${req.pr.number}

${renderDiff(req.files)}

Question: ${req.question}`;
}
