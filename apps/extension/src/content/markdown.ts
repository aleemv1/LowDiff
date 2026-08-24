/**
 * A deliberately small Markdown subset: fenced code blocks and inline code.
 *
 * That is what models actually emit when explaining a diff, and it is the part
 * that reads as broken when rendered as plain text. Anything richer would mean
 * shipping a full parser into a content script for very little gain.
 */

export interface CodeBlock {
  type: 'code';
  lang: string;
  code: string;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export type Block = CodeBlock | TextBlock;

export interface CodeSpan {
  type: 'code';
  text: string;
}

export interface PlainSpan {
  type: 'plain';
  text: string;
}

export type Span = CodeSpan | PlainSpan;

const FENCE = /^\s*```([\w+-]*)\s*$/;

/** Split text into paragraphs and fenced code blocks, in order. */
export function parseBlocks(input: string): Block[] {
  const blocks: Block[] = [];
  const lines = input.split('\n');

  let text: string[] = [];
  let code: string[] | null = null;
  let lang = '';

  const flushText = () => {
    const joined = text.join('\n').replace(/^\n+|\n+$/g, '');
    if (joined) blocks.push({ type: 'text', text: joined });
    text = [];
  };

  for (const line of lines) {
    const fence = FENCE.exec(line);

    if (code === null && fence) {
      flushText();
      code = [];
      lang = fence[1] ?? '';
      continue;
    }

    if (code !== null) {
      // A closing fence carries no language; a line with one ends the block.
      if (fence && !fence[1]) {
        blocks.push({ type: 'code', lang, code: code.join('\n') });
        code = null;
        lang = '';
        continue;
      }
      code.push(line);
      continue;
    }

    text.push(line);
  }

  // An unterminated fence still holds real code — render it rather than lose it.
  if (code !== null) blocks.push({ type: 'code', lang, code: code.join('\n') });
  flushText();

  return blocks;
}

/** Split a run of text into plain and inline-code spans. */
export function parseSpans(input: string): Span[] {
  const spans: Span[] = [];
  const pattern = /`([^`\n]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    if (match.index > last) {
      spans.push({ type: 'plain', text: input.slice(last, match.index) });
    }
    spans.push({ type: 'code', text: match[1]! });
    last = match.index + match[0].length;
  }

  if (last < input.length) spans.push({ type: 'plain', text: input.slice(last) });
  return spans;
}
