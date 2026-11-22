import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest } from '../lib/intercom-client.js';

/**
 * reply-conversation — POST /conversations/{conversationId}/reply.
 */
export function registerReplyConversationTool(app: AgentApp): void {
  app.tool('reply-conversation', {
    description:
      'Reply to an Intercom conversation as an admin. Can send a public reply to the customer or add a private internal note.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The Intercom conversation ID',
        },
        body: {
          type: 'string',
          description: 'The reply text (plain text or HTML)',
        },
        type: {
          type: 'string',
          enum: ['comment', 'note'],
          description:
            '"comment" sends a public reply to the customer; "note" adds a private internal note visible only to the team (default: comment)',
        },
        adminId: {
          type: 'string',
          description: 'The admin ID to reply as. If omitted, uses the token owner.',
        },
      },
      required: ['conversationId', 'body'],
    },
    // Destructive: the default type "comment" sends the reply to the customer, and a send
    // cannot be undone.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const {
        conversationId,
        body,
        type = 'comment',
        adminId,
      } = args as {
        conversationId: string;
        body: string;
        type?: string;
        adminId?: string;
      };

      // Get the token owner's admin ID if not provided
      let replyAdminId = adminId;
      if (!replyAdminId) {
        const me = await intercomRequest<Record<string, unknown>>(ctx, '/me');
        replyAdminId = me.id as string;
      }

      return intercomRequest(ctx, `/conversations/${conversationId}/reply`, {
        method: 'POST',
        body: {
          message_type: type,
          type: 'admin',
          admin_id: replyAdminId,
          body,
        },
      });
    },
  });
}
