import { GoogleGenAI } from '@google/genai';
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
 * Google adapter.
 *
 * The only provider of the three with a usable third-party OAuth path: an
 * access token minted by "Sign in with Google" works directly, so users can
 * connect an account instead of pasting a key.
 */
export class GoogleClient implements LlmClient {
  readonly provider = 'google' as const;
  readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(config: ProviderConfig) {
    this.model = config.model ?? DEFAULT_MODELS.google;
    // An account token is not an API key: the API takes it in an
    // Authorization header, and sending it as x-goog-api-key is rejected.
    // The SDK insists on an apiKey option, so pass a placeholder and carry
    // the real credential in headers.
    this.client =
      config.auth.kind === 'apiKey'
        ? new GoogleGenAI({ apiKey: config.auth.key })
        : new GoogleGenAI({
            apiKey: 'unused-oauth-placeholder',
            httpOptions: {
              headers: { Authorization: `Bearer ${config.auth.accessToken}` },
            },
          });
  }

  async annotate(req: AnnotateRequest): Promise<AnnotateResponse> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: userPrompt(req.files, req.title, req.body, req.context),
      config: {
        systemInstruction: systemPrompt(),
        responseMimeType: 'application/json',
        responseJsonSchema: noteSchema(),
        ...(req.signal ? { abortSignal: req.signal } : {}),
      },
    });

    const parsed = parseResponse(JSON.parse(response.text ?? ''));
    return {
      summary: parsed.summary,
      notes: parsed.notes,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatDelta> {
    const history = req.history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const stream = await this.client.models.generateContentStream({
      model: this.model,
      contents: [...history, { role: 'user', parts: [{ text: chatUserPrompt(req) }] }],
      config: {
        systemInstruction: chatSystemPrompt(req),
        ...(req.signal ? { abortSignal: req.signal } : {}),
      },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield { type: 'text', text };
    }
    yield { type: 'done' };
  }
}
