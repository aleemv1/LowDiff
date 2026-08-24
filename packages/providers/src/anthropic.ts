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
import { toAnthropicJsonSchema } from './schema-dialects.js';
import { chatSystemPrompt, chatUserPrompt, toolsPrompt } from './chat-prompt.js';

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
        output_config: {
          format: { type: 'json_schema', schema: toAnthropicJsonSchema(noteSchema(req.mode)) },
        },
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
    if (!req.tools) {
      yield* this.plainChat(req);
      return;
    }
    yield* this.toolChat(req, req.tools);
  }

  private async *plainChat(req: ChatRequest): AsyncIterable<ChatDelta> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: 4096,
        system: [
          { type: 'text', text: chatSystemPrompt(req), cache_control: { type: 'ephemeral' } },
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
    const final = await stream.finalMessage();
    yield {
      type: 'usage',
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
      rounds: 0,
    };
    yield { type: 'done' };
  }

  /**
   * Claude Code-style loop: the model greps and reads registered repos until
   * it can answer. Cost containment is structural — a hard round cap, capped
   * tool outputs (enforced by the daemon), and a cached system prefix so each
   * round pays cache-read prices for everything before it.
   */
  private async *toolChat(
    req: ChatRequest,
    tools: NonNullable<ChatRequest['tools']>,
  ): AsyncIterable<ChatDelta> {
    const MAX_ROUNDS = 6;

    const toolDefs: Anthropic.Tool[] = [
      {
        name: 'search_code',
        description:
          'Search the registered repositories for a fixed string (not a regex). Returns up to 30 matching lines as repo/path:line: text.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            repo: { type: 'string', description: 'Optional: restrict to one repo by name.' },
          },
          required: ['query'],
        },
      },
      {
        name: 'read_file',
        description: 'Read up to 160 lines of a file from a registered repository.',
        input_schema: {
          type: 'object',
          properties: {
            repo: { type: 'string' },
            path: { type: 'string', description: 'Repo-relative path.' },
            startLine: { type: 'integer', minimum: 1 },
          },
          required: ['repo', 'path'],
        },
      },
    ];

    const system: Anthropic.TextBlockParam[] = [
      {
        type: 'text',
        text: chatSystemPrompt(req) + toolsPrompt(tools.repoNames),
        cache_control: { type: 'ephemeral' },
      },
    ];
    const messages: Anthropic.MessageParam[] = [
      ...req.history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: chatUserPrompt(req) },
    ];

    let inputTokens = 0;
    let outputTokens = 0;
    let rounds = 0;

    for (;;) {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 4096,
          system,
          messages,
          tools: toolDefs,
          // After the cap, no tools are offered, which forces a final answer.
          ...(rounds >= MAX_ROUNDS ? { tool_choice: { type: 'none' as const } } : {}),
        },
        req.signal ? { signal: req.signal } : {},
      );

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (toolUses.length === 0 || rounds >= MAX_ROUNDS) {
        for (const block of response.content) {
          if (block.type === 'text' && block.text) yield { type: 'text', text: block.text };
        }
        yield { type: 'usage', inputTokens, outputTokens, rounds };
        yield { type: 'done' };
        return;
      }

      rounds++;
      messages.push({ role: 'assistant', content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const input = use.input as Record<string, unknown>;
        let output: string;
        try {
          if (use.name === 'search_code') {
            const query = String(input['query'] ?? '');
            const repo = typeof input['repo'] === 'string' ? input['repo'] : undefined;
            yield { type: 'tool', label: `searching “${query}”` };
            output = await tools.search(query, repo);
          } else {
            const repo = String(input['repo'] ?? '');
            const path = String(input['path'] ?? '');
            yield { type: 'tool', label: `reading ${repo}/${path}` };
            output = await tools.read(repo, path, Number(input['startLine']) || undefined);
          }
        } catch (error) {
          output = `tool failed: ${error instanceof Error ? error.message : String(error)}`;
        }
        results.push({ type: 'tool_result', tool_use_id: use.id, content: output });
      }
      messages.push({ role: 'user', content: results });
    }
  }
}
