import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * get-board — GET /boards/{boardId}.
 */
export function registerGetBoardTool(app: AgentApp): void {
  app.tool('get-board', {
    description: 'Get details of a specific Trello board. Params: boardId (required).',
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

      const board = await trelloRequest(ctx, `/boards/${encodeURIComponent(boardId)}`);

      return board;
    },
  });
}
