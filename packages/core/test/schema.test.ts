import { describe, it, expect } from 'vitest';
import { noteSchema, parseResponse } from '../src/schema.js';

const good = {
  kind: 'RISK',
  title: 'In-flight requests are not cancelled',
  body: 'Debounce delays the fetch but does not abort earlier ones.',
  path: 'a.ts',
  side: 'RIGHT',
  line: 26,
  confidence: 'high',
};

describe('noteSchema', () => {
  it('restricts review mode to the three problem kinds', () => {
    const s = noteSchema('review') as any;
    expect(s.properties.notes.items.properties.kind.enum).toEqual([
      'RISK',
      'SECURITY',
      'BREAKING',
    ]);
  });

  it('allows all six kinds in explain mode', () => {
    const s = noteSchema('explain') as any;
    expect(s.properties.notes.items.properties.kind.enum).toHaveLength(6);
  });

  it('caps review mode harder than explain mode', () => {
    const review = noteSchema('review') as any;
    const explain = noteSchema('explain') as any;
    expect(review.properties.notes.maxItems).toBeLessThan(
      explain.properties.notes.maxItems,
    );
  });
});

describe('parseResponse', () => {
  it('keeps a well-formed note', () => {
    const r = parseResponse({ summary: 's', notes: [good] }, 'review');
    expect(r.notes).toHaveLength(1);
    expect(r.summary).toBe('s');
  });

  it('drops a note whose kind is not allowed in this mode', () => {
    const r = parseResponse({ summary: 's', notes: [{ ...good, kind: 'EXPLAIN' }] }, 'review');
    expect(r.notes).toEqual([]);
  });

  it('accepts that same note in explain mode', () => {
    const r = parseResponse({ summary: 's', notes: [{ ...good, kind: 'EXPLAIN' }] }, 'explain');
    expect(r.notes).toHaveLength(1);
  });

  it('drops an over-long title rather than truncating it', () => {
    const r = parseResponse({ summary: 's', notes: [{ ...good, title: 'x'.repeat(61) }] }, 'review');
    expect(r.notes).toEqual([]);
  });

  it('drops a note with a non-integer line', () => {
    const r = parseResponse({ summary: 's', notes: [{ ...good, line: 2.5 }] }, 'review');
    expect(r.notes).toEqual([]);
  });

  it('drops a note missing required fields', () => {
    const r = parseResponse({ summary: 's', notes: [{ kind: 'RISK' }] }, 'review');
    expect(r.notes).toEqual([]);
  });

  it('keeps good notes alongside bad ones', () => {
    const r = parseResponse({ summary: 's', notes: [{ kind: 'RISK' }, good] }, 'review');
    expect(r.notes).toHaveLength(1);
  });

  it('tolerates a response with no notes array', () => {
    expect(parseResponse({ summary: 's' }, 'review').notes).toEqual([]);
  });

  it('throws when there is no summary', () => {
    expect(() => parseResponse({ notes: [] }, 'review')).toThrow(/summary/);
  });

  it('throws on a non-object response', () => {
    expect(() => parseResponse('nope', 'review')).toThrow();
  });
});
