import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * create-group -- Create a new group in a board.
 */
export function registerCreateGroupTool(app: AgentApp): void {
  app.tool('create-group', {
    description:
      'Create a new group in a Monday.com board. Returns { id, title }. Params: board_id (required), group_name (required).',
    parameters: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board.',
        },
        group_name: {
          type: 'string',
          description: 'Name of the group.',
        },
      },
      required: ['board_id', 'group_name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const query = `mutation { create_group(board_id: ${a.board_id}, group_name: "${a.group_name}") { id title } }`;
      const result = await mondayRequest(ctx, query, undefined, false);
      return result.create_group;
    },
  });
}
