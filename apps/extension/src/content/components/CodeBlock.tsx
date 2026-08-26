import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import Prism from 'prismjs';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-tsx.js';
import { C } from '../theme.js';

/** Token colours, resolved from GitHub's syntax variables so themes carry. */
const TOKEN_COLOR: Record<string, string> = {
  comment: 'var(--fgColor-muted, #6a737d)',
  prolog: 'var(--fgColor-muted, #6a737d)',
  doctype: 'var(--fgColor-muted, #6a737d)',
  cdata: 'var(--fgColor-muted, #6a737d)',
  punctuation: 'var(--fgColor-default, #24292f)',
  property: 'var(--color-prettylights-syntax-constant, #0550ae)',
  tag: 'var(--color-prettylights-syntax-entity-tag, #116329)',
  constant: 'var(--color-prettylights-syntax-constant, #0550ae)',
  symbol: 'var(--color-prettylights-syntax-constant, #0550ae)',
  boolean: 'var(--color-prettylights-syntax-constant, #0550ae)',
  number: 'var(--color-prettylights-syntax-constant, #0550ae)',
  selector: 'var(--color-prettylights-syntax-string, #0a3069)',
  string: 'var(--color-prettylights-syntax-string, #0a3069)',
  char: 'var(--color-prettylights-syntax-string, #0a3069)',
  builtin: 'var(--color-prettylights-syntax-entity, #8250df)',
  inserted: 'var(--color-prettylights-syntax-string, #0a3069)',
  operator: 'var(--color-prettylights-syntax-constant, #0550ae)',
  keyword: 'var(--color-prettylights-syntax-keyword, #cf222e)',
  function: 'var(--color-prettylights-syntax-entity, #8250df)',
  'class-name': 'var(--color-prettylights-syntax-entity, #8250df)',
  atrule: 'var(--color-prettylights-syntax-keyword, #cf222e)',
  regex: 'var(--color-prettylights-syntax-string, #0a3069)',
  important: 'var(--color-prettylights-syntax-keyword, #cf222e)',
  key: 'var(--color-prettylights-syntax-entity-tag, #116329)',
};

const ALIASES: Record<string, string> = {
  yml: 'yaml',
  sh: 'bash',
  shell: 'bash',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
};

/**
 * Render Prism tokens as elements rather than an HTML string.
 *
 * This runs inside a page we do not control, so nothing built from model
 * output is ever handed to innerHTML.
 */
function renderTokens(tokens: (string | Prism.Token)[]): ComponentChildren[] {
  return tokens.map((token, i) => {
    if (typeof token === 'string') return token;

    const content = Array.isArray(token.content)
      ? renderTokens(token.content as (string | Prism.Token)[])
      : typeof token.content === 'string'
        ? token.content
        : renderTokens([token.content as Prism.Token]);

    const color = TOKEN_COLOR[token.type];
    return (
      <span key={i} style={color ? { color } : undefined}>
        {content}
      </span>
    );
  });
}

/**
 * Strip the indentation every line shares, plus blank edges. Model snippets
 * keep the diff's original nesting, and sixteen spaces of lead-in wastes most
 * of a 440px popover before the code starts.
 */
export function dedent(code: string): string {
  const trimmed = code.replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '');
  const lines = trimmed.split('\n');
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => /^[ \t]*/.exec(line)![0].length);
  const common = indents.length > 0 ? Math.min(...indents) : 0;
  return common === 0 ? trimmed : lines.map((line) => line.slice(common)).join('\n');
}

interface Props {
  code: string;
  lang: string;
}

export function CodeBlock({ code, lang }: Props) {
  const [copied, setCopied] = useState(false);
  const resolved = ALIASES[lang] ?? lang;
  const grammar = resolved ? Prism.languages[resolved] : undefined;
  const flush = dedent(code);

  const body = grammar
    ? renderTokens(Prism.tokenize(flush, grammar))
    : flush;

  const copy = () => {
    void navigator.clipboard.writeText(flush).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <div
      style={{
        border: `1px solid ${C.line}`,
        borderRadius: '8px',
        overflow: 'hidden',
        margin: '10px 0',
        background: C.page,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '5px 8px 5px 12px',
          borderBottom: `1px solid ${C.line}`,
          background: C.surface,
        }}
      >
        <span
          style={{
            font: '600 10px ui-monospace, Menlo, monospace',
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: C.faint,
          }}
        >
          {resolved || 'code'}
        </span>
        <button
          onClick={copy}
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '5px',
            font: `600 10.5px 'DM Sans', -apple-system, sans-serif`,
            color: copied ? 'var(--ld-ok-fg)' : C.faint,
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <pre
        style={{
          margin: 0,
          padding: '10px 12px',
          overflowX: 'auto',
          font: '11.5px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace',
          color: C.ink,
          whiteSpace: 'pre',
        }}
      >
        {body}
      </pre>
    </div>
  );
}
