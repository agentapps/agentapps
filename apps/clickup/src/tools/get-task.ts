import type { AgentApp } from '@agentapps/sdk';
import { clickupRequest, formatTask } from '../lib/clickup-client.js';

export function registerGetTaskTool(app: AgentApp): void {
  app.tool('get-task', {
    description: 'Get detailed information about a specific ClickUp task.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID' },
      },
      required: ['taskId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { taskId } = args as { taskId: string };
      const data = await clickupRequest(ctx, `/task/${taskId}`);
      return formatTask(data);
    },
  });
}
