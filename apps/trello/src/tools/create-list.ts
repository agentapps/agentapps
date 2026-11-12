import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * create-list — POST /lists.
 */
export function registerCreateListTool(app: AgentApp): void {
  app.tool('create-list', {
    description:
      'Create a new list in a Trello board. Params: boardId (required), name (required), pos? (top, bottom, or a positive number).',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'The ID of board.' },
        name: { type: 'string', description: 'Name of list.' },
        pos: {
          type: 'string',
          description: 'Position: top, bottom, or a positive number (optional).',
        },
      },
      required: ['boardId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const body: Record<string, unknown> = {
        name: a.name,
        idBoard: a.boardId,
      };
      if (typeof a.pos === 'string' && a.pos) body.pos = a.pos;

      const list = await trelloRequest(ctx, '/lists', { method: 'POST', body });

      return list;
    },
  });
}
