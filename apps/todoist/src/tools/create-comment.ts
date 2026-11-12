import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * create-comment — POST /comments.
 */
export function registerCreateCommentTool(app: AgentApp): void {
  app.tool('create-comment', {
    description:
      'Create a comment on a Todoist task or project (POST /comments). Returns the created comment. Params: content (required — comment text), taskId? (task ID to comment on), projectId? (project ID to comment on). At least one of taskId or projectId should be provided.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Comment content (required).',
        },
        taskId: {
          type: 'string',
          description: 'Task ID to comment on (optional).',
        },
        projectId: {
          type: 'string',
          description: 'Project ID to comment on (optional).',
        },
      },
      required: ['content'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body: Record<string, unknown> = { content: a.content };
      if (a.taskId) body.task_id = a.taskId;
      if (a.projectId) body.project_id = a.projectId;

      const comment = await todoistRequest(ctx, '/comments', { method: 'POST', body });
      return { comment };
    },
  });
}
