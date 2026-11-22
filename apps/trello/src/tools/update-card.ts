import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * update-card — PUT /cards/{cardId}.
 */
export function registerUpdateCardTool(app: AgentApp): void {
  app.tool('update-card', {
    description:
      'Update a Trello card (move to different list, change name, description, etc). Params: cardId (required), name?, desc?, idList?, due?, closed?.',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'The ID of card to update.' },
        name: { type: 'string', description: 'New name for card (optional).' },
        desc: { type: 'string', description: 'New description for card (optional).' },
        idList: { type: 'string', description: 'ID of list to move card to (optional).' },
        due: { type: 'string', description: 'New due date in ISO 8601 format (optional).' },
        closed: { type: 'boolean', description: 'Whether to archive card (optional).' },
      },
      required: ['cardId'],
    },
    annotations: {
      readOnlyHint: false,
      // Fields can be set back, and `closed` archives: closed false restores the card.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const cardId = String(a.cardId);
      const body: Record<string, unknown> = {};

      if (typeof a.name === 'string' && a.name) body.name = a.name;
      if (typeof a.desc === 'string' && a.desc) body.desc = a.desc;
      if (typeof a.idList === 'string' && a.idList) body.idList = a.idList;
      if (typeof a.due === 'string' && a.due) body.due = a.due;
      if (typeof a.closed === 'boolean') body.closed = a.closed;

      const card = await trelloRequest(ctx, `/cards/${encodeURIComponent(cardId)}`, {
        method: 'PUT',
        body,
      });

      return card;
    },
  });
}
