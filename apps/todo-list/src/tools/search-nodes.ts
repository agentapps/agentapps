import type { AgentApp } from '@agentapps/sdk';
import { TodoStore } from '../lib/index.js';
import { requireUserId, toToolError } from './_shared.js';

export function registerSearchNodes(app: AgentApp): void {
  app.tool('search-nodes', {
    description:
      'Search nodes by text across all of the user\'s nodes. Case-insensitive. Returns: { results: [{ nodeId, text, description, completed, path, updatedAt }] } where path is a breadcrumb like "Parent / Child / Match". Max 50 results.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search text (case-insensitive). Min 1 char, max 500.',
        },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    handler: async (args, ctx) => {
      try {
        requireUserId(ctx);
        const query = args.query as string;
        if (!query || typeof query !== 'string' || query.trim() === '') {
          throw new Error('query is required and must be a non-empty string.');
        }

        const results = await TodoStore.searchNodes(ctx.storage, query);
        return {
          results: results.map((n) => ({
            nodeId: n.nodeId,
            text: n.text,
            description: n.description ?? '',
            completed: n.completed,
            path: n.path,
            updatedAt: n.updatedAt,
          })),
        };
      } catch (error) {
        toToolError(error);
      }
    },
  });
}
