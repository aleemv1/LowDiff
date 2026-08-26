import { describe, it, expect } from 'vitest';
import { parseBlocks, parseSpans } from '../src/content/markdown.js';
import { dedent } from '../src/content/components/CodeBlock.js';

describe('parseBlocks', () => {
  it('returns a single text block for plain prose', () => {
    expect(parseBlocks('hello there')).toEqual([{ type: 'text', text: 'hello there' }]);
  });

  it('extracts a fenced block with its language', () => {
    const blocks = parseBlocks('before\n```yaml\nname: x\n```\nafter');
    expect(blocks).toEqual([
      { type: 'text', text: 'before' },
      { type: 'code', lang: 'yaml', code: 'name: x' },
      { type: 'text', text: 'after' },
    ]);
  });

  it('handles a fence with no language', () => {
    expect(parseBlocks('```\nraw\n```')).toEqual([{ type: 'code', lang: '', code: 'raw' }]);
  });

  it('keeps indentation inside the block', () => {
    const [block] = parseBlocks('```yaml\n  strategy:\n    max-parallel: 5\n```');
    expect((block as { code: string }).code).toBe('  strategy:\n    max-parallel: 5');
  });

  it('handles two blocks separated by prose', () => {
    const blocks = parseBlocks('Drop it:\n```yaml\na: 1\n```\n\nOr:\n```yaml\nb: 2\n```');
    expect(blocks.map((b) => b.type)).toEqual(['text', 'code', 'text', 'code']);
  });

  it('does not lose code when the closing fence is missing', () => {
    const blocks = parseBlocks('text\n```yaml\nname: x');
    expect(blocks).toContainEqual({ type: 'code', lang: 'yaml', code: 'name: x' });
  });

  it('preserves blank lines inside a block', () => {
    const [block] = parseBlocks('```\na\n\nb\n```');
    expect((block as { code: string }).code).toBe('a\n\nb');
  });

  it('trims surrounding blank lines from prose', () => {
    expect(parseBlocks('\n\nhi\n\n')).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('drops an empty trailing paragraph', () => {
    expect(parseBlocks('```\nx\n```\n')).toHaveLength(1);
  });

  it('returns nothing for empty input', () => {
    expect(parseBlocks('')).toEqual([]);
  });
});

describe('parseSpans', () => {
  it('splits inline code out of prose', () => {
    expect(parseSpans('the `matrix` key')).toEqual([
      { type: 'plain', text: 'the ' },
      { type: 'code', text: 'matrix' },
      { type: 'plain', text: ' key' },
    ]);
  });

  it('handles several spans', () => {
    expect(parseSpans('`a` and `b`').filter((s) => s.type === 'code')).toHaveLength(2);
  });

  it('leaves prose without backticks alone', () => {
    expect(parseSpans('nothing here')).toEqual([{ type: 'plain', text: 'nothing here' }]);
  });

  it('ignores an unmatched backtick', () => {
    expect(parseSpans('a ` b')).toEqual([{ type: 'plain', text: 'a ` b' }]);
  });

  it('does not span across a newline', () => {
    expect(parseSpans('a `b\nc` d').every((s) => s.type === 'plain')).toBe(true);
  });
});

describe('parseBlocks: headings, lists, tables', () => {
  it('parses a heading', () => {
    expect(parseBlocks('## Practical severity')).toEqual([
      { type: 'heading', text: 'Practical severity' },
    ]);
  });

  it('groups consecutive dash items into one list', () => {
    expect(parseBlocks('- first\n- second')).toEqual([
      { type: 'list', items: ['first', 'second'] },
    ]);
  });

  it('separates a list from surrounding prose', () => {
    const blocks = parseBlocks('intro:\n- a\n- b\nafter');
    expect(blocks.map((b) => b.type)).toEqual(['text', 'list', 'text']);
  });

  it('drops a table divider row entirely', () => {
    expect(parseBlocks('|---|---|')).toEqual([]);
  });

  it('flattens a table row into a sentence', () => {
    expect(parseBlocks('| `openai_api_key` | trailing `_` |')).toEqual([
      { type: 'text', text: '`openai_api_key` — trailing `_`' },
    ]);
  });

  it('does not treat a heading inside a fence as a heading', () => {
    const blocks = parseBlocks('```\n## not a heading\n```');
    expect(blocks).toEqual([{ type: 'code', lang: '', code: '## not a heading' }]);
  });

  it('does not treat a dash item inside a fence as a list', () => {
    const blocks = parseBlocks('```yaml\n- uses: actions/checkout@v4\n```');
    expect(blocks[0]).toEqual({ type: 'code', lang: 'yaml', code: '- uses: actions/checkout@v4' });
  });
});

describe('parseSpans: bold', () => {
  it('parses bold spans', () => {
    expect(parseSpans('a **big** deal')).toEqual([
      { type: 'plain', text: 'a ' },
      { type: 'bold', text: 'big' },
      { type: 'plain', text: ' deal' },
    ]);
  });

  it('mixes bold and code in one line', () => {
    const kinds = parseSpans('**note**: `x` differs').map((s) => s.type);
    expect(kinds).toEqual(['bold', 'plain', 'code', 'plain']);
  });
});

describe('dedent', () => {
  it('strips the indentation common to every line', () => {
    expect(dedent('        else:\n            cls = x')).toBe('else:\n    cls = x');
  });

  it('ignores blank lines when measuring the common indent', () => {
    expect(dedent('    a\n\n      b')).toBe('a\n\n  b');
  });

  it('trims leading and trailing blank lines', () => {
    expect(dedent('\n    a\n    b\n\n')).toBe('a\nb');
  });

  it('leaves already-flush code alone', () => {
    expect(dedent('a\n  b')).toBe('a\n  b');
  });
});
