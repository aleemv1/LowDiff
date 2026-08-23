export * from './types.js';
export * from './schema-dialects.js';
export { AnthropicClient } from './anthropic.js';
export { OpenAIClient } from './openai.js';
export { GoogleClient } from './google.js';

import { AnthropicClient } from './anthropic.js';
import { GoogleClient } from './google.js';
import { OpenAIClient } from './openai.js';
import type { LlmClient, ProviderConfig } from './types.js';

/**
 * Build a client for the configured provider.
 *
 * Statically imported on purpose. A dynamic import() makes the bundler emit a
 * preload helper that touches document.head, which throws in a service worker
 * — and since the worker ships as one inlined file anyway, deferring the SDKs
 * would not have saved anything.
 */
export function createLlmClient(config: ProviderConfig): LlmClient {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicClient(config);
    case 'openai':
      return new OpenAIClient(config);
    case 'google':
      return new GoogleClient(config);
  }
}
