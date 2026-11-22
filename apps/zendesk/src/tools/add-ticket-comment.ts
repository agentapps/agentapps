import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * add-ticket-comment — PUT /tickets/{id}.json with comment body.
 */
export function registerAddTicketCommentTool(app: AgentApp): void {
  app.tool('add-ticket-comment', {
    description:
      'Add a comment to a Zendesk ticket. Can be public (customer-visible) or internal note. Returns the updated ticket. Params: ticketId, body, public?.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'Zendesk ticket ID.',
        },
        body: {
          type: 'string',
          description: 'Comment text/body.',
        },
        public: {
          type: 'boolean',
          description: 'Whether the comment is public (customer-visible). Default true.',
        },
      },
      required: ['ticketId', 'body'],
    },
    annotations: {
      readOnlyHint: false,
      // A comment is public by default, reaches the requester and cannot be removed.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const {
        ticketId,
        body,
        public: isPublic = true,
      } = args as {
        ticketId: string;
        body: string;
        public?: boolean;
      };

      const result = await zendeskRequest<any>(ctx, `/tickets/${ticketId}.json`, {
        method: 'PUT',
        body: {
          ticket: {
            comment: {
              body,
              public: isPublic,
            },
          },
        },
      });

      const t = result.ticket;
      return {
        id: t.id,
        subject: t.subject,
        status: t.status,
        updatedAt: t.updated_at,
        url: t.url,
      };
    },
  });
}
