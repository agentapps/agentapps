import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * create-card — POST /cards.
 */
export function registerCreateCardTool(app: AgentApp): void {
  app.tool('create-card', {
    description:
      'Create a new card in a Trello list. Params: listId (required), name (required), desc?, pos?, due? (ISO 8601), labels? (comma-separated label IDs).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'The ID of list to create card in.' },
        name: { type: 'string', description: 'The name/title of card.' },
        desc: { type: 'string', description: 'The description of card (optional).' },
        pos: {
          type: 'string',
          description: 'Position of card: top, bottom, or a positive number (optional).',
        },
        due: {
          type: 'string',
          description: 'Due date in ISO 8601 format (optional).',
        },
        labels: {
          type: 'string',
          description: 'Comma-separated list of label IDs (optional).',
        },
      },
      required: ['listId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const body: Record<string, unknown> = {
        idList: a.listId,
        name: a.name,
      };

      if (typeof a.desc === 'string' && a.desc) body.desc = a.desc;
      if (typeof a.pos === 'string' && a.pos) body.pos = a.pos;
      if (typeof a.due === 'string' && a.due) body.due = a.due;
      if (typeof a.labels === 'string' && a.labels) body.idLabels = a.labels;

      const card = await trelloRequest(ctx, '/cards', { method: 'POST', body });

      return card;
    },
  });
}
