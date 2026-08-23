export * from './types.js';
export * from './schema-dialects.js';

import type { LlmClient, ProviderConfig } from './types.js';

/**
 * Build a client for the configured provider.
 *
 * The adapters are dynamically imported so the service worker only pays for
 * the SDK the user actually selected — loading all three at startup would
 * triple the worker's cold start for no benefit.
 */
export async function createLlmClient(config: ProviderConfig): Promise<LlmClient> {
  switch (config.provider) {
    case 'anthropic': {
      const { AnthropicClient } = await import('./anthropic.js');
      return new AnthropicClient(config);
    }
    case 'openai': {
      const { OpenAIClient } = await import('./openai.js');
      return new OpenAIClient(config);
    }
    case 'google': {
      const { GoogleClient } = await import('./google.js');
      return new GoogleClient(config);
    }
  }
}
