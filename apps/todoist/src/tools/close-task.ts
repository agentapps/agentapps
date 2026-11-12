import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * close-task — POST /tasks/{taskId}/close.
 *
 * Marks a task as completed.
 */
export function registerCloseTaskTool(app: AgentApp): void {
  app.tool('close-task', {
    description:
      'Close (complete) a Todoist task (POST /tasks/{taskId}/close). Returns { taskId, closed }. Params: taskId (required).',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID to close (required).',
        },
      },
      required: ['taskId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      await todoistRequest(ctx, `/tasks/${a.taskId}/close`, { method: 'POST' });
      return { taskId: a.taskId, closed: true };
    },
  });
}
