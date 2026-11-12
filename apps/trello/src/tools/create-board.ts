import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * create-board — POST /boards.
 */
export function registerCreateBoardTool(app: AgentApp): void {
  app.tool('create-board', {
    description:
      'Create a new Trello board. Params: name (required), desc?, defaultLists? (default true), prefs_background?.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of board.' },
        desc: { type: 'string', description: 'Description of board (optional).' },
        defaultLists: {
          type: 'boolean',
          description: 'Whether to create default lists (To Do, Doing, Done). Default: true.',
          default: true,
        },
        prefs_background: {
          type: 'string',
          description:
            'Background color or image (optional, e.g., "blue", "orange", "gradient-rainbow").',
        },
      },
      required: ['name'],
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
        defaultLists: typeof a.defaultLists === 'boolean' ? a.defaultLists : true,
      };
      if (typeof a.desc === 'string' && a.desc) body.desc = a.desc;
      if (typeof a.prefs_background === 'string' && a.prefs_background) {
        body.prefs_background = a.prefs_background;
      }

      const board = await trelloRequest(ctx, '/boards', { method: 'POST', body });

      return board;
    },
  });
}
