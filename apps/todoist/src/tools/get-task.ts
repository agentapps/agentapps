import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * get-task — GET /tasks/{taskId}.
 */
export function registerGetTaskTool(app: AgentApp): void {
  app.tool('get-task', {
    description:
      'Get a single Todoist task by ID (GET /tasks/{taskId}). Returns the task with id, content, description, project_id, due, priority, labels, etc. Params: taskId (required).',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID (required).',
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
      const task = await todoistRequest(ctx, `/tasks/${a.taskId}`);
      return { task };
    },
  });
}
