import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient } from '../lib/index.js';

/**
 * modify-message — PATCH /me/messages/{messageId}.
 */
export function registerModifyMessageTool(app: AgentApp): void {
  app.tool('modify-message', {
    description:
      'Modify a message: mark as read/unread, set importance, add categories, or flag it.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The ID of the message to modify' },
        isRead: { type: 'boolean', description: 'Mark as read (true) or unread (false)' },
        importance: { type: 'string', description: 'Set importance: low, normal, high' },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Set category labels (replaces existing)',
        },
        flag: {
          type: 'string',
          description: 'Set flag status: notFlagged, flagged, complete',
        },
      },
      required: ['messageId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = args as Record<string, unknown>;
      const messageId = a.messageId as string;
      const updates: any = {};

      if (a.isRead !== undefined) updates.isRead = a.isRead as boolean;
      if (a.importance) updates.importance = a.importance as string;
      if (a.categories) updates.categories = a.categories as string[];
      if (a.flag) updates.flag = { flagStatus: a.flag as string };

      await graphRequest('PATCH', `/me/messages/${messageId}`, updates);

      return { success: true, account: email, messageId, updates };
    },
  });
}
