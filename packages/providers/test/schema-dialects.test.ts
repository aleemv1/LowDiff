import { describe, it, expect } from 'vitest';
import { noteSchema } from '@lowdiff/core';
import { toStrictJsonSchema } from '../src/schema-dialects.js';

const strict = toStrictJsonSchema(noteSchema('explain')) as any;
const note = strict.properties.notes.items;

describe('toStrictJsonSchema', () => {
  it('lists every property as required, including optional ones', () => {
    expect(note.required).toContain('code');
    expect(note.required).toEqual(Object.keys(note.properties));
  });

  it('makes a previously-optional property nullable', () => {
    expect(note.properties.code.type).toEqual(['string', 'null']);
  });

  it('leaves genuinely required properties non-nullable', () => {
    expect(note.properties.title.type).toBe('string');
  });

  it('sets additionalProperties false on every object', () => {
    expect(strict.additionalProperties).toBe(false);
    expect(note.additionalProperties).toBe(false);
  });

  it('strips length and item bounds that strict mode rejects', () => {
    expect(note.properties.title.maxLength).toBeUndefined();
    expect(strict.properties.notes.maxItems).toBeUndefined();
  });

  it('preserves enums', () => {
    expect(note.properties.side.enum).toEqual(['LEFT', 'RIGHT']);
    expect(note.properties.kind.enum).toHaveLength(6);
  });

  it('does not mutate the input schema', () => {
    const original = noteSchema('explain') as any;
    toStrictJsonSchema(original);
    expect(original.properties.notes.items.required).not.toContain('code');
    expect(original.properties.notes.items.properties.title.maxLength).toBe(60);
  });
});
