import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * reply-to-ticket — POST /tickets/{ticketId}/reply
 *
 * Sends a reply to a Freshdesk ticket. The reply is visible to the requester.
 */
export function registerReplyToTicketTool(app: AgentApp): void {
  app.tool('reply-to-ticket', {
    description:
      'Reply to a Freshdesk ticket (POST /api/v2/tickets/{ticketId}/reply). Sends a public reply visible to the requester. Requires body (HTML content). Returns the created conversation entry.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The Freshdesk ticket ID to reply to.',
        },
        body: {
          type: 'string',
          description: 'HTML content of the reply.',
        },
      },
      required: ['ticketId', 'body'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const ticketId = args.ticketId as number;
      const params: Record<string, unknown> = {
        body: args.body,
      };

      return await freshdeskRequest('POST', `/tickets/${ticketId}/reply`, params, ctx);
    },
  });
}
