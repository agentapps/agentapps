import type { AgentApp } from '@agentapps/sdk';
import { clickupRequest } from '../lib/clickup-client.js';

export function registerGetListsTool(app: AgentApp): void {
  app.tool('get-lists', {
    description: 'Get all lists in a ClickUp folder.',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'The folder ID' },
        archived: { type: 'boolean', description: 'Include archived lists (default: false)' },
      },
      required: ['folderId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { folderId, archived = false } = args as { folderId: string; archived?: boolean };
      const data = (await clickupRequest(ctx, `/folder/${folderId}/list`, {
        params: { archived: String(archived) },
      })) as { lists: any[] };
      return {
        folderId,
        lists: data.lists.map((list) => ({
          id: list.id,
          name: list.name,
          orderIndex: list.orderindex,
          taskCount: list.task_count,
          archived: list.archived,
          status: list.status,
          priority: list.priority,
          dueDate: list.due_date,
          startDate: list.start_date,
        })),
      };
    },
  });
}
