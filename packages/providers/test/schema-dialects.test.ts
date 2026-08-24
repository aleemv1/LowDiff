import { describe, it, expect } from 'vitest';
import { noteSchema } from '@lowdiff/core';
import { toAnthropicJsonSchema, toStrictJsonSchema } from '../src/schema-dialects.js';

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

const anthropic = toAnthropicJsonSchema(noteSchema('explain')) as any;
const anthropicNote = anthropic.properties.notes.items;

describe('toAnthropicJsonSchema', () => {
  it('strips the constraint keywords structured outputs reject', () => {
    expect(anthropic.properties.summary.maxLength).toBeUndefined();
    expect(anthropic.properties.notes.maxItems).toBeUndefined();
    expect(anthropicNote.properties.line.minimum).toBeUndefined();
  });

  it('keeps optional properties optional', () => {
    expect(anthropicNote.required).not.toContain('code');
  });

  it('preserves enums and additionalProperties', () => {
    expect(anthropicNote.properties.side.enum).toEqual(['LEFT', 'RIGHT']);
    expect(anthropic.additionalProperties).toBe(false);
    expect(anthropicNote.additionalProperties).toBe(false);
  });

  it('does not mutate the input schema', () => {
    const original = noteSchema('explain') as any;
    toAnthropicJsonSchema(original);
    expect(original.properties.notes.maxItems).toBe(30);
    expect(original.properties.notes.items.properties.line.minimum).toBe(1);
  });
});
