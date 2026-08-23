type JsonSchema = Record<string, unknown>;

/**
 * OpenAI's strict structured outputs require every property to appear in
 * `required` and `additionalProperties: false` on every object. Optional
 * properties are expressed as nullable instead.
 *
 * Anthropic and Gemini both accept the canonical schema as-is, so this is the
 * only dialect conversion we need — which is the point of keeping one schema
 * in core rather than three.
 */
export function toStrictJsonSchema(schema: JsonSchema): JsonSchema {
  return convert(schema) as JsonSchema;
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
