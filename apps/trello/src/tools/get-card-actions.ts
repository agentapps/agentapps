import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * get-card-actions — GET /cards/{cardId}/actions.
 */
export function registerGetCardActionsTool(app: AgentApp): void {
  app.tool('get-card-actions', {
    description:
      'Get actions/activity history for a Trello card. Params: cardId (required), filter? (all, commentCard, updateCard, createCard, etc; default "all").',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'The ID of card.' },
        filter: {
          type: 'string',
          description: 'Filter actions: all, commentCard, updateCard, createCard, etc.',
          default: 'all',
        },
      },
      required: ['cardId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const cardId = String(a.cardId);
      const filter = typeof a.filter === 'string' ? a.filter : 'all';

      const actions = await trelloRequest(ctx, `/cards/${encodeURIComponent(cardId)}/actions`, {
        query: { filter },
      });

      return actions;
    },
  });
}
