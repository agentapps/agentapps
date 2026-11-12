import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * list-boards — GET /members/me/boards.
 */
export function registerListBoardsTool(app: AgentApp): void {
  app.tool('list-boards', {
    description:
      'List all boards accessible to the authenticated Trello user. Params: filter? (all, open, closed, members, organization, public, starred; default "open").',
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Filter boards: all, open, closed, members, organization, public, starred.',
          enum: ['all', 'open', 'closed', 'members', 'organization', 'public', 'starred'],
          default: 'open',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const filter = typeof a.filter === 'string' ? a.filter : 'open';

      const boards = await trelloRequest(ctx, '/members/me/boards', {
        query: { filter },
      });

      return boards;
    },
  });
}
