import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * list-labels — GET /boards/{boardId}/labels.
 */
export function registerListLabelsTool(app: AgentApp): void {
  app.tool('list-labels', {
    description: 'List all labels on a Trello board. Params: boardId (required).',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'The ID of board.' },
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

      const labels = await trelloRequest(ctx, `/boards/${encodeURIComponent(boardId)}/labels`);

      return labels;
    },
  });
}
