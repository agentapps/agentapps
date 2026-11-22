import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * create-board -- Create a new board.
 */
export function registerCreateBoardTool(app: AgentApp): void {
  app.tool('create-board', {
    description:
      'Create a new Monday.com board. Returns { id, name }. Params: name (required), kind? ("public"|"private"|"share", default "public"), workspace_id? (number).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the board.',
        },
        kind: {
          type: 'string',
          description: 'Board kind: public, private, or share (default "public").',
          enum: ['public', 'private', 'share'],
          default: 'public',
        },
        workspace_id: {
          type: 'number',
          description: 'Workspace ID to create the board in (optional).',
        },
      },
      required: ['name'],
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
      const kind = (a.kind as string) || 'public';
      const workspaceArg = a.workspace_id ? `, workspace_id: ${a.workspace_id}` : '';
      const query = `mutation { create_board(board_name: "${a.name}", board_kind: ${kind}${workspaceArg}) { id name } }`;
      const result = await mondayRequest(ctx, query, undefined, false);
      return result.create_board;
    },
  });
}
