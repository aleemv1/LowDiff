import { describe, it, expect } from 'vitest';
import { parseBlocks, parseSpans } from '../src/content/markdown.js';

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
