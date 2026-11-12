import type { AgentApp } from '@agentapps/sdk';
import { clickupRequest } from '../lib/clickup-client.js';

export function registerGetCommentsTool(app: AgentApp): void {
  app.tool('get-comments', {
    description: 'Get all comments on a ClickUp task.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID' },
      },
      required: ['taskId'],
    },
    annotations: {
      readOnlyHint: true,
    },
    handler: async (args, ctx) => {
      const { taskId } = args as { taskId: string };
      const data = (await clickupRequest(ctx, `/task/${taskId}/comment`)) as { comments: any[] };

      return {
        taskId,
        count: data.comments.length,
        comments: data.comments.map((c) => ({
          id: c.id,
          commentText: c.comment_text,
          user: c.user ? { id: c.user.id, username: c.user.username, email: c.user.email } : null,
          resolved: c.resolved,
          date: c.date ? new Date(parseInt(c.date, 10)).toISOString() : null,
        })),
      };
    },
  });
}
