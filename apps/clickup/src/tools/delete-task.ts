import type { AgentApp } from '@agentapps/sdk';
import { clickupRequest } from '../lib/clickup-client.js';

export function registerDeleteTaskTool(app: AgentApp): void {
  app.tool('delete-task', {
    description: 'Delete a ClickUp task permanently.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID to delete' },
      },
      required: ['taskId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { taskId } = args as { taskId: string };
      await clickupRequest(ctx, `/task/${taskId}`, { method: 'DELETE' });
      return { success: true, taskId, message: 'Task deleted successfully' };
    },
  });
}
