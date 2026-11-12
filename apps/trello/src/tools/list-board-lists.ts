import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * list-board-lists — GET /boards/{boardId}/lists.
 */
export function registerListBoardListsTool(app: AgentApp): void {
  app.tool('list-board-lists', {
    description: 'Get all lists in a Trello board. Params: boardId (required).',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'The ID or short URL of board.' },
      },
      required: ['boardId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const boardId = String(a.boardId);

      const lists = await trelloRequest(ctx, `/boards/${encodeURIComponent(boardId)}/lists`);

      return lists;
    },
  });
}
