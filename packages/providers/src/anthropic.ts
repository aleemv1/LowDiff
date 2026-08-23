import Anthropic from '@anthropic-ai/sdk';
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
import { chatSystemPrompt, chatUserPrompt } from './chat-prompt.js';

/**
 * Anthropic adapter.
 *
 * API key only. Subscription OAuth is restricted to Claude Code and claude.ai
 * by Anthropic's Feb 2026 policy, so there is no third-party OAuth path here.
 */
export class AnthropicClient implements LlmClient {
  readonly provider = 'anthropic' as const;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(config: ProviderConfig) {
    if (config.auth.kind !== 'apiKey') {
      throw new Error(
        'Anthropic supports API keys only — subscription OAuth is restricted to Claude Code and claude.ai.',
      );
    }
    this.model = config.model ?? DEFAULT_MODELS.anthropic;
    this.client = new Anthropic({
      apiKey: config.auth.key,
      // The extension calls this from the service worker, which is browser-like.
      dangerouslyAllowBrowser: true,
    });
  }

  async annotate(req: AnnotateRequest): Promise<AnnotateResponse> {
    const response = await this.client.beta.messages.create(
      {
        model: this.model,
        max_tokens: 16000,
        // Stable prefix first so it stays cacheable across PRs.
        system: [
          {
            type: 'text',
            text: systemPrompt(req.mode),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          { role: 'user', content: userPrompt(req.files, req.title, req.body) },
        ],
        output_format: { type: 'json_schema', schema: noteSchema(req.mode) },
      },
      req.signal ? { signal: req.signal } : {},
    );

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const parsed = parseResponse(JSON.parse(text), req.mode);
    return {
      summary: parsed.summary,
      notes: parsed.notes,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatDelta> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: 4096,
        system: [
          { type: 'text', text: chatSystemPrompt(), cache_control: { type: 'ephemeral' } },
        ],
        messages: [
          ...req.history.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user' as const, content: chatUserPrompt(req) },
        ],
      },
      req.signal ? { signal: req.signal } : {},
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }
    yield { type: 'done' };
  }
}
