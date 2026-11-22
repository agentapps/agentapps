import type { AgentApp } from '@agentapps/sdk';
import { clickupRequest } from '../lib/clickup-client.js';

export function registerAddCommentTool(app: AgentApp): void {
  app.tool('add-comment', {
    description: 'Add a comment to a ClickUp task.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID to comment on' },
        commentText: { type: 'string', description: 'The comment text (markdown supported)' },
        notifyAll: {
          type: 'boolean',
          description: 'Notify all assignees of the task (default: false)',
        },
      },
      required: ['taskId', 'commentText'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const {
        taskId,
        commentText,
        notifyAll = false,
      } = args as {
        taskId: string;
        commentText: string;
        notifyAll?: boolean;
      };

      const data = (await clickupRequest(ctx, `/task/${taskId}/comment`, {
        method: 'POST',
        body: { comment_text: commentText, notify_all: notifyAll },
      })) as any;

      return {
        id: data.id,
        taskId,
        histId: data.hist_id,
      };
    },
  });
}
