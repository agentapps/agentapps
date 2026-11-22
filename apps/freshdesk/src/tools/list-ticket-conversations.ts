import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * list-ticket-conversations — GET /tickets/{ticketId}/conversations
 *
 * Lists all conversations (replies, notes) on a Freshdesk ticket.
 */
export function registerListTicketConversationsTool(app: AgentApp): void {
  app.tool('list-ticket-conversations', {
    description:
      'List all conversations (replies and notes) on a Freshdesk ticket (GET /api/v2/tickets/{ticketId}/conversations). Optional pagination: page, per_page. Returns conversation id, body, incoming flag, user_id, and timestamps.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The Freshdesk ticket ID.',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
        },
        per_page: {
          type: 'number',
          description: 'Results per page (default 30, max 100).',
        },
      },
      required: ['ticketId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const ticketId = args.ticketId as number;
      const a = args as Record<string, unknown>;
      const params: Record<string, unknown> = {};
      if (a.page !== undefined) params.page = a.page;
      if (a.per_page !== undefined) params.per_page = a.per_page;

      const hasParams = Object.keys(params).length > 0;
      const conversations = await freshdeskRequest<unknown[]>(
        'GET',
        `/tickets/${ticketId}/conversations`,
        hasParams ? params : undefined,
        ctx,
      );

      return { count: conversations.length, conversations };
    },
  });
}
