import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * list-comments — GET /comments.
 */
export function registerListCommentsTool(app: AgentApp): void {
  app.tool('list-comments', {
    description:
      'List comments for a Todoist task or project (GET /comments). At least one of taskId or projectId must be provided. Returns an array of comments. Params: taskId? (task ID), projectId? (project ID).',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'Task ID to get comments for (optional).',
        },
        projectId: {
          type: 'string',
          description: 'Project ID to get comments for (optional).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const query: Record<string, string | undefined> = {};
      if (a.taskId) query.task_id = String(a.taskId);
      if (a.projectId) query.project_id = String(a.projectId);

      const comments = await todoistRequest<unknown[]>(ctx, '/comments', { query });
      return { comments };
    },
  });
}
