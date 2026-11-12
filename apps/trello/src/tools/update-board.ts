import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * update-board — PUT /boards/{boardId}.
 */
export function registerUpdateBoardTool(app: AgentApp): void {
  app.tool('update-board', {
    description:
      'Update board properties (name, description, background, etc). Params: boardId (required), name?, desc?, prefs_background?.',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'The ID of board to update.' },
        name: { type: 'string', description: 'New name for board (optional).' },
        desc: { type: 'string', description: 'New description for board (optional).' },
        prefs_background: {
          type: 'string',
          description:
            'Background color or image (optional, e.g., "blue", "orange", "gradient-rainbow").',
        },
      },
      required: ['boardId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const boardId = String(a.boardId);
      const body: Record<string, unknown> = {};

      if (typeof a.name === 'string' && a.name) body.name = a.name;
      if (typeof a.desc === 'string' && a.desc) body.desc = a.desc;
      if (typeof a.prefs_background === 'string' && a.prefs_background) {
        body.prefs_background = a.prefs_background;
      }

      const board = await trelloRequest(ctx, `/boards/${encodeURIComponent(boardId)}`, {
        method: 'PUT',
        body,
      });

      return board;
    },
  });
}
