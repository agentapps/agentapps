import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * create-label — POST /boards/{boardId}/labels.
 */
export function registerCreateLabelTool(app: AgentApp): void {
  app.tool('create-label', {
    description:
      'Create a label on a Trello board. Params: boardId (required), name (required), color (required: yellow, purple, blue, red, green, orange, black, sky, pink, lime).',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'string', description: 'The ID of board.' },
        name: { type: 'string', description: 'Name of label.' },
        color: {
          type: 'string',
          description:
            'Color of label: yellow, purple, blue, red, green, orange, black, sky, pink, lime.',
          enum: [
            'yellow',
            'purple',
            'blue',
            'red',
            'green',
            'orange',
            'black',
            'sky',
            'pink',
            'lime',
          ],
        },
      },
      required: ['boardId', 'name', 'color'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const boardId = String(a.boardId);

      const label = await trelloRequest(ctx, `/boards/${encodeURIComponent(boardId)}/labels`, {
        method: 'POST',
        body: { name: a.name, color: a.color },
      });

      return label;
    },
  });
}
