import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * delete-task — DELETE /tasks/{taskId}.
 */
export function registerDeleteTaskTool(app: AgentApp): void {
  app.tool('delete-task', {
    description:
      'Delete an Asana task by GID (DELETE /tasks/{taskId}). Returns an empty object on success. Params: taskId (required).',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task GID to delete (required).',
        },
      },
      required: ['taskId'],
    },
    // Asana keeps a deleted task in its trash for a while, but no tool of this app restores it.
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      await asanaRequest(ctx, `tasks/${a.taskId}`, { method: 'DELETE' });
      return { deleted: true };
    },
  });
}
