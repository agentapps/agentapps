import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * list-cards — GET /lists/{listId}/cards.
 */
export function registerListCardsTool(app: AgentApp): void {
  app.tool('list-cards', {
    description: 'Get all cards in a Trello list. Params: listId (required).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'The ID of list.' },
      },
      required: ['listId'],
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
      const listId = String(a.listId);

      const cards = await trelloRequest(ctx, `/lists/${encodeURIComponent(listId)}/cards`);

      return cards;
    },
  });
}
