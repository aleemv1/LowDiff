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

function spans(text: string) {
  return parseSpans(text).map((span, j) =>
    span.type === 'code' ? (
      inline(span.text, j)
    ) : span.type === 'bold' ? (
      <b key={j}>{span.text}</b>
    ) : (
      span.text
    ),
  );
}

export function Markdown({ text, font }: Props) {
  return (
    <>
      {parseBlocks(text).map((block, i) => {
        switch (block.type) {
          case 'code':
            return <CodeBlock key={i} code={block.code} lang={block.lang} />;
          case 'heading':
            return (
              <div
                key={i}
                style={{ margin: '14px 0 4px', font: `700 1.05em/1.4 inherit`, color: C.ink }}
              >
                {spans(block.text)}
              </div>
            );
          case 'list':
            return (
              <ul key={i} style={{ margin: '6px 0', paddingLeft: '18px', font }}>
                {block.items.map((item, j) => (
                  <li key={j} style={{ margin: '3px 0' }}>
                    {spans(item)}
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i} style={{ margin: i === 0 ? '0 0 8px' : '8px 0', font, whiteSpace: 'pre-wrap' }}>
                {spans(block.text)}
              </p>
            );
        }
      })}
    </>
  );
}
