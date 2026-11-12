import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * list-boards -- List all boards accessible to the user.
 */
export function registerListBoardsTool(app: AgentApp): void {
  app.tool('list-boards', {
    description:
      'List all Monday.com boards accessible to the user. Returns an array of { id, name, state, workspace_id }. Params: limit? (default 25), workspace_ids? (number[]).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of boards to return (default 25).',
          default: 25,
        },
        workspace_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by workspace IDs (optional).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const limit = typeof a.limit === 'number' ? a.limit : 25;
      const workspaceFilter = Array.isArray(a.workspace_ids)
        ? `, workspace_ids: [${(a.workspace_ids as number[]).join(',')}]`
        : '';
      const query = `query { boards(limit: ${limit}${workspaceFilter}) { id name state workspace_id } }`;
      const result = await mondayRequest(ctx, query);
      return result.boards;
    },
  });
}
