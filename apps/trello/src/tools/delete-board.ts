import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * delete-board — DELETE /boards/{boardId}.
 */
export function registerDeleteBoardTool(app: AgentApp): void {
  app.tool('delete-board', {
    description: 'Delete a Trello board permanently. Params: boardId (required).',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'The ID of board to delete.' },
      },
      required: ['boardId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const boardId = String(a.boardId);

      await trelloRequest(ctx, `/boards/${encodeURIComponent(boardId)}`, { method: 'DELETE' });

      return { deleted: true, boardId };
    },
  });
}
