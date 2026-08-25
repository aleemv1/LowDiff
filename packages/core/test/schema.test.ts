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
  it('offers all six kinds — one scan covers problems and explanation', () => {
    const s = noteSchema() as any;
    expect(s.properties.notes.items.properties.kind.enum).toHaveLength(6);
    expect(s.properties.notes.items.properties.kind.enum).toContain('RISK');
    expect(s.properties.notes.items.properties.kind.enum).toContain('EXPLAIN');
  });

  it('caps the note count', () => {
    const s = noteSchema() as any;
    expect(s.properties.notes.maxItems).toBe(30);
  });
});

describe('parseResponse', () => {
  it('keeps a well-formed note', () => {
    const r = parseResponse({ summary: 's', notes: [good] });
    expect(r.notes).toHaveLength(1);
    expect(r.summary).toBe('s');
  });

  it('keeps every known kind', () => {
    const r = parseResponse({ summary: 's', notes: [{ ...good, kind: 'EXPLAIN' }] });
    expect(r.notes).toHaveLength(1);
  });

  it('drops a note whose kind is unknown', () => {
    const r = parseResponse({ summary: 's', notes: [{ ...good, kind: 'BANANA' }] });
    expect(r.notes).toEqual([]);
  });

  it('drops an over-long title rather than truncating it', () => {
    const r = parseResponse({ summary: 's', notes: [{ ...good, title: 'x'.repeat(61) }] });
    expect(r.notes).toEqual([]);
  });

  it('drops a note with a non-integer line', () => {
    const r = parseResponse({ summary: 's', notes: [{ ...good, line: 2.5 }] });
    expect(r.notes).toEqual([]);
  });

  it('drops a note missing required fields', () => {
    const r = parseResponse({ summary: 's', notes: [{ kind: 'RISK' }] });
    expect(r.notes).toEqual([]);
  });

  it('keeps good notes alongside bad ones', () => {
    const r = parseResponse({ summary: 's', notes: [{ kind: 'RISK' }, good] });
    expect(r.notes).toHaveLength(1);
  });

  it('tolerates a response with no notes array', () => {
    expect(parseResponse({ summary: 's' }).notes).toEqual([]);
  });

  it('throws when there is no summary', () => {
    expect(() => parseResponse({ notes: [] })).toThrow(/summary/);
  });

  it('throws on a non-object response', () => {
    expect(() => parseResponse('nope')).toThrow();
  });
});
