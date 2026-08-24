import { parseBlocks, parseSpans } from '../markdown.js';
import { C } from '../theme.js';
import { CodeBlock } from './CodeBlock.js';

interface Props {
  text: string;
  /** Font shorthand for prose, so callers keep their own type scale. */
  font: string;
}

/** Inline code: distinguishable, but not a full code block. */
function inline(text: string, key: number) {
  return (
    <code
      key={key}
      style={{
        font: '0.9em ui-monospace, SFMono-Regular, Menlo, monospace',
        // The accent tint alone was nearly invisible on GitHub's dark themes;
        // the muted surface plus a border reads on both.
        background: C.page,
        border: `1px solid ${C.line}`,
        color: C.accentDark,
        borderRadius: '4px',
        padding: '0.5px 4px',
        wordBreak: 'break-word',
      }}
    >
      {text}
    </code>
  );
}

export function Markdown({ text, font }: Props) {
  return (
    <>
      {parseBlocks(text).map((block, i) =>
        block.type === 'code' ? (
          <CodeBlock key={i} code={block.code} lang={block.lang} />
        ) : (
          <p key={i} style={{ margin: i === 0 ? '0 0 8px' : '8px 0', font, whiteSpace: 'pre-wrap' }}>
            {parseSpans(block.text).map((span, j) =>
              span.type === 'code' ? inline(span.text, j) : span.text,
            )}
          </p>
        ),
      )}
    </>
  );
}
