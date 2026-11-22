import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * get-card — GET /cards/{cardId}.
 */
export function registerGetCardTool(app: AgentApp): void {
  app.tool('get-card', {
    description: 'Get details of a specific Trello card. Params: cardId (required).',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'The ID or short URL of card.' },
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

      const card = await trelloRequest(ctx, `/cards/${encodeURIComponent(cardId)}`);

      return card;
    },
  });
}
