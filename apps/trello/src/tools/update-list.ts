import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * update-list — PUT /lists/{listId}.
 */
export function registerUpdateListTool(app: AgentApp): void {
  app.tool('update-list', {
    description:
      'Update a Trello list (change name, color, position, or archive it). Params: listId (required), name?, color?, pos?, closed?.',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'The ID of list to update.' },
        name: { type: 'string', description: 'New name for list (optional).' },
        color: {
          type: 'string',
          description:
            'Color for list (optional): pink, yellow, lime, blue, black, orange, red, purple, sky, green.',
          enum: [
            'pink',
            'yellow',
            'lime',
            'blue',
            'black',
            'orange',
            'red',
            'purple',
            'sky',
            'green',
          ],
        },
        pos: {
          type: 'string',
          description: 'New position: top, bottom, or a positive number (optional).',
        },
        closed: {
          type: 'boolean',
          description: 'Whether to archive the list (optional).',
        },
      },
      required: ['listId'],
    },
    annotations: {
      readOnlyHint: false,
      // Fields can be set back, and `closed` archives: closed false restores the list.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const listId = String(a.listId);
      const body: Record<string, unknown> = {};

      if (typeof a.name === 'string' && a.name) body.name = a.name;
      if (typeof a.color === 'string' && a.color) body.color = a.color;
      if (typeof a.pos === 'string' && a.pos) body.pos = a.pos;
      if (typeof a.closed === 'boolean') body.closed = a.closed;

      const list = await trelloRequest(ctx, `/lists/${encodeURIComponent(listId)}`, {
        method: 'PUT',
        body,
      });

      return list;
    },
  });
}
