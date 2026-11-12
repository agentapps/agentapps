import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * get-board -- Get details of a specific board including its groups and columns.
 */
export function registerGetBoardTool(app: AgentApp): void {
  app.tool('get-board', {
    description:
      'Get details of a specific Monday.com board including its groups and columns. Returns { id, name, state, workspace_id, groups:[{id,title,color}], columns:[{id,title,type,settings_str}] }. Params: board_id (required).',
    parameters: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board.',
        },
      },
      required: ['board_id'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const query = `query { boards(ids: [${a.board_id}]) { id name state workspace_id groups { id title color } columns { id title type settings_str } } }`;
      const result = await mondayRequest(ctx, query);
      return result.boards[0];
    },
  });
}
