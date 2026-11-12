import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * delete-ticket — DELETE /tickets/{ticketId}
 *
 * Deletes a Freshdesk support ticket by its ID.
 */
export function registerDeleteTicketTool(app: AgentApp): void {
  app.tool('delete-ticket', {
    description:
      'Delete a Freshdesk support ticket by its ID (DELETE /api/v2/tickets/{ticketId}). This permanently removes the ticket. Returns a success confirmation.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The Freshdesk ticket ID to delete.',
        },
      },
      required: ['ticketId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const ticketId = args.ticketId as number;
      return await freshdeskRequest('DELETE', `/tickets/${ticketId}`, undefined, ctx);
    },
  });
}
