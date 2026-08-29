import type { Mode, NoteKind, RawNote } from './types.js';
import { EXPLAIN_KINDS, REVIEW_KINDS } from './types.js';

export const TITLE_MAX = 60;
export const BODY_MAX = 350;
// The prompt tells the model to put anything longer than the prose cap into
// the code block, so the code cap must stay roomier than BODY_MAX.
export const CODE_MAX = 600;

/**
 * The JSON Schema every provider enforces natively (Anthropic `output_config`,
 * OpenAI structured outputs, Gemini `responseSchema`).
 *
 * This is the contract. It is deliberately the *same* schema for all three, so
 * "does provider X hold the contract" is one test run three times rather than
 * three prompts to tune separately.
 */
export function noteSchema(): Record<string, unknown> {
  const kinds = EXPLAIN_KINDS;
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'notes'],
    properties: {
      summary: {
        type: 'string',
        description:
          'At most two sentences: what the change does, then the single most important problem with it, if any. No preamble, no restating the diff, no hedging.',
        maxLength: 400,
      },
      notes: {
        type: 'array',
        maxItems: 30,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'title', 'body', 'path', 'side', 'line', 'confidence'],
          properties: {
            kind: { type: 'string', enum: [...kinds] },
            title: { type: 'string', maxLength: TITLE_MAX },
            body: { type: 'string', maxLength: BODY_MAX },
            code: { type: 'string', maxLength: CODE_MAX },
            path: { type: 'string' },
            side: { type: 'string', enum: ['LEFT', 'RIGHT'] },
            line: { type: 'integer', minimum: 1 },
            endLine: {
              type: 'integer',
              minimum: 1,
              description:
                'Last line of the enclosing function or block, when the finding spans more than one line. Omit for single-line findings.',
            },
            confidence: { type: 'string', enum: ['high', 'medium'] },
          },
        },
      },
    },
  };
}

export interface ParsedResponse {
  summary: string;
  notes: RawNote[];
}

const SIDES = new Set(['LEFT', 'RIGHT']);
const CONFIDENCES = new Set(['high', 'medium']);

function isRawNote(value: unknown, kinds: readonly NoteKind[]): value is RawNote {
  if (typeof value !== 'object' || value === null) return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n['kind'] === 'string' &&
    (kinds as readonly string[]).includes(n['kind']) &&
    typeof n['title'] === 'string' &&
    n['title'].length > 0 &&
    n['title'].length <= TITLE_MAX &&
    typeof n['body'] === 'string' &&
    n['body'].length > 0 &&
    (n['code'] === undefined || typeof n['code'] === 'string') &&
    (n['endLine'] === undefined ||
      n['endLine'] === null ||
      (typeof n['endLine'] === 'number' && Number.isInteger(n['endLine']))) &&
    typeof n['path'] === 'string' &&
    typeof n['side'] === 'string' &&
    SIDES.has(n['side']) &&
    typeof n['line'] === 'number' &&
    Number.isInteger(n['line']) &&
    n['line'] >= 1 &&
    typeof n['confidence'] === 'string' &&
    CONFIDENCES.has(n['confidence'])
  );
}

/**
 * Validate a provider's JSON response.
 *
 * Providers enforce the schema server-side, but they don't all enforce it
 * equally well, and a malformed note must never reach the overlay. Individual
 * bad notes are dropped; a response with no usable shape at all throws.
 */
export function parseResponse(value: unknown): ParsedResponse {
  if (typeof value !== 'object' || value === null) {
    throw new Error('model response was not an object');
  }
  const root = value as Record<string, unknown>;
  if (typeof root['summary'] !== 'string') {
    throw new Error('model response is missing a summary');
  }
  const rawNotes = Array.isArray(root['notes']) ? root['notes'] : [];
  const kinds = EXPLAIN_KINDS;

  return {
    summary: root['summary'],
    // Over-long bodies clamp rather than drop: provider-side maxLength
    // usually prevents them, but losing a SECURITY finding to verbosity
    // fails far harder than an ellipsis. Structural defects still drop.
    notes: rawNotes
      .filter((n): n is RawNote => isRawNote(n, kinds))
      .map((n) =>
        n.body.length <= BODY_MAX
          ? n
          : { ...n, body: `${n.body.slice(0, BODY_MAX - 1).replace(/\s+\S*$/, '')}…` },
      ),
  };
}
