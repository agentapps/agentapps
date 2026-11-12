import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * delete-task — DELETE /tasks/{taskId}.
 *
 * Permanently deletes the task. IRREVERSIBLE + destructive.
 */
export function registerDeleteTaskTool(app: AgentApp): void {
  app.tool('delete-task', {
    description:
      'Delete a Todoist task permanently (DELETE /tasks/{taskId}). IRREVERSIBLE — the task is removed. Returns { taskId, deleted }. Params: taskId (required).',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID to delete (required).',
        },
      },
      required: ['taskId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      await todoistRequest(ctx, `/tasks/${a.taskId}`, { method: 'DELETE' });
      return { taskId: a.taskId, deleted: true };
    },
  });
}
