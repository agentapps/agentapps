import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * reopen-task — POST /tasks/{taskId}/reopen.
 *
 * Reopens a previously completed task.
 */
export function registerReopenTaskTool(app: AgentApp): void {
  app.tool('reopen-task', {
    description:
      'Reopen a completed Todoist task (POST /tasks/{taskId}/reopen). Returns { taskId, reopened }. Params: taskId (required).',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID to reopen (required).',
        },
      },
      required: ['taskId'],
    },
    // close-task undoes it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      await todoistRequest(ctx, `/tasks/${a.taskId}/reopen`, { method: 'POST' });
      return { taskId: a.taskId, reopened: true };
    },
  });
}
