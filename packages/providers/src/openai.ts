import OpenAI from 'openai';
import { noteSchema, parseResponse, systemPrompt, userPrompt } from '@lowdiff/core';
import type {
  AnnotateRequest,
  AnnotateResponse,
  ChatDelta,
  ChatRequest,
  LlmClient,
  ProviderConfig,
} from './types.js';
import { DEFAULT_MODELS } from './types.js';
import { toStrictJsonSchema } from './schema-dialects.js';
import { chatSystemPrompt, chatUserPrompt } from './chat-prompt.js';

/**
 * OpenAI adapter.
 *
 * Accepts an API key, or an OAuth access token from the device-code flow when
 * that path is available to us (it is gated on OpenAI's approval, so the key
 * remains the supported route).
 */
export class OpenAIClient implements LlmClient {
  readonly provider = 'openai' as const;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(config: ProviderConfig) {
    this.model = config.model ?? DEFAULT_MODELS.openai;
    this.client = new OpenAI({
      apiKey:
        config.auth.kind === 'apiKey' ? config.auth.key : config.auth.accessToken,
      dangerouslyAllowBrowser: true,
    });
  }

  async annotate(req: AnnotateRequest): Promise<AnnotateResponse> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt(req.mode) },
          { role: 'user', content: userPrompt(req.files, req.title, req.body) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'lowdiff_notes',
            strict: true,
            schema: toStrictJsonSchema(noteSchema(req.mode)),
          },
        },
      },
      req.signal ? { signal: req.signal } : {},
    );

    const text = response.choices[0]?.message.content ?? '';
    const parsed = parseResponse(JSON.parse(text), req.mode);
    return {
      summary: parsed.summary,
      notes: parsed.notes,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatDelta> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        stream: true,
        messages: [
          { role: 'system', content: chatSystemPrompt() },
          ...req.history.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: chatUserPrompt(req) },
        ],
      },
      req.signal ? { signal: req.signal } : {},
    );

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta.content;
      if (text) yield { type: 'text', text };
    }
    yield { type: 'done' };
  }
}
