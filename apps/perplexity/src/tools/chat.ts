/**
 * perplexity_chat — multi-turn conversation with Perplexity AI.
 */

import type { AgentApp } from '@agentapps/sdk';
import {
  formatWithSources,
  PERPLEXITY_MODELS,
  type PerplexityMessage,
  type PerplexityModel,
  perplexityFetch,
} from '../types.js';

export function registerChatTool(app: AgentApp): void {
  app.tool('chat', {
    description:
      'Multi-turn conversation with Perplexity AI. Send a list of messages (system/user/assistant) and receive an AI-generated response with source citations.',
    parameters: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          description: 'Conversation messages in chronological order',
          items: {
            type: 'object',
            properties: {
              role: {
                type: 'string',
                enum: ['system', 'user', 'assistant'],
                description: 'Message role',
              },
              content: {
                type: 'string',
                description: 'Message content',
              },
            },
            required: ['role', 'content'],
          },
        },
        model: {
          type: 'string',
          enum: PERPLEXITY_MODELS as unknown as string[],
          description: 'Perplexity model to use (default: sonar)',
        },
      },
      required: ['messages'],
    },
    // A completion from the Perplexity API: it changes nothing, though each call uses API credit.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const apiKey = await ctx.systemSecret('APIKEY');
      if (!apiKey) {
        throw new Error('Missing APIKEY system secret — configure it to use Perplexity.');
      }

      const messages = args.messages as PerplexityMessage[];
      const model = (args.model as PerplexityModel) ?? 'sonar';

      ctx.log('info', `Chat with ${messages.length} message(s)`, { model });

      const { answer, citations } = await perplexityFetch(apiKey, messages, model);

      return {
        answer,
        formatted: formatWithSources(answer, citations),
        citations,
        model,
      };
    },
  });
}
