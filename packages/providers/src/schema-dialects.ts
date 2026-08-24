type JsonSchema = Record<string, unknown>;

/**
 * OpenAI's strict structured outputs require every property to appear in
 * `required` and `additionalProperties: false` on every object. Optional
 * properties are expressed as nullable instead.
 */
export function toStrictJsonSchema(schema: JsonSchema): JsonSchema {
  return convert(schema) as JsonSchema;
}

/**
 * Anthropic's structured outputs reject value-constraint keywords (string
 * lengths, array bounds, numeric ranges). `parseResponse` in core re-checks
 * those limits client-side, so they can be dropped from the wire schema
 * without weakening the contract.
 */
export function toAnthropicJsonSchema(schema: JsonSchema): JsonSchema {
  return strip(schema) as JsonSchema;
}

const ANTHROPIC_UNSUPPORTED = new Set([
  'maxLength',
  'minLength',
  'maxItems',
  'minItems',
  'minimum',
  'maximum',
  'multipleOf',
]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (typeof node !== 'object' || node === null) return node;

  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node as JsonSchema)) {
    if (ANTHROPIC_UNSUPPORTED.has(key)) continue;
    out[key] = key === 'properties' ? stripProperties(value) : strip(value);
  }
  return out;
}

function stripProperties(value: unknown): JsonSchema {
  if (typeof value !== 'object' || value === null) return {};
  const out: JsonSchema = {};
  for (const [name, sub] of Object.entries(value as JsonSchema)) {
    out[name] = strip(sub);
  }
  return out;
}

function convert(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(convert);
  if (typeof node !== 'object' || node === null) return node;

  const src = node as JsonSchema;
  const out: JsonSchema = {};

  for (const [key, value] of Object.entries(src)) {
    // OpenAI rejects these validation keywords in strict mode.
    if (key === 'maxLength' || key === 'minLength' || key === 'maxItems' || key === 'minItems') {
      continue;
    }
    out[key] = key === 'properties' ? convertProperties(value) : convert(value);
  }

  if (src['type'] === 'object' && typeof src['properties'] === 'object') {
    const names = Object.keys(src['properties'] as JsonSchema);
    const required = new Set((src['required'] as string[] | undefined) ?? []);
    const props = out['properties'] as JsonSchema;

    for (const name of names) {
      if (required.has(name)) continue;
      // Optional -> nullable, and listed as required, per OpenAI strict mode.
      props[name] = makeNullable(props[name] as JsonSchema);
    }

    out['required'] = names;
    out['additionalProperties'] = false;
  }

  return out;
}

function convertProperties(value: unknown): JsonSchema {
  if (typeof value !== 'object' || value === null) return {};
  const out: JsonSchema = {};
  for (const [name, sub] of Object.entries(value as JsonSchema)) {
    out[name] = convert(sub);
  }
  return out;
}

function makeNullable(schema: JsonSchema): JsonSchema {
  const type = schema['type'];
  if (typeof type === 'string') return { ...schema, type: [type, 'null'] };
  if (Array.isArray(type) && !type.includes('null')) {
    return { ...schema, type: [...type, 'null'] };
  }
  return schema;
}
