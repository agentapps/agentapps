/**
 * perplexity_search — one-shot web search with AI-generated answer and citations.
 */

import type { AgentApp } from '@agentapps/sdk';
import {
  formatWithSources,
  PERPLEXITY_MODELS,
  type PerplexityModel,
  perplexityFetch,
} from '../types.js';

export function registerSearchTool(app: AgentApp): void {
  app.tool('search', {
    description:
      'Search the web using Perplexity AI. Returns an AI-generated answer with source citations.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        model: {
          type: 'string',
          enum: PERPLEXITY_MODELS as unknown as string[],
          description: 'Perplexity model to use (default: sonar)',
        },
      },
      required: ['query'],
    },
    // A query to the Perplexity API: it changes nothing, though each call uses API credit.
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

      const query = args.query as string;
      const model = (args.model as PerplexityModel) ?? 'sonar';

      ctx.log('info', `Searching: "${query}"`, { model });

      const { answer, citations } = await perplexityFetch(
        apiKey,
        [{ role: 'user', content: query }],
        model,
      );

      return {
        answer,
        formatted: formatWithSources(answer, citations),
        citations,
        model,
      };
    },
  });
}
