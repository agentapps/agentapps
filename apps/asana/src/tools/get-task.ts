import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * get-task — GET /tasks/{taskId}.
 */
export function registerGetTaskTool(app: AgentApp): void {
  app.tool('get-task', {
    description:
      'Get a single Asana task by GID (GET /tasks/{taskId}). Returns the task with gid, name, notes, assignee, completed, due_on, projects, etc. Params: taskId (required).',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task GID (required).',
        },
      },
      required: ['taskId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const task = await asanaRequest(ctx, `tasks/${a.taskId}`);
      return { task };
    },
  });
}
