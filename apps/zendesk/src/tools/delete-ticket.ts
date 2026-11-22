import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * delete-ticket — DELETE /tickets/{id}.json.
 *
 * Soft-deletes the ticket. Destructive + idempotent.
 */
export function registerDeleteTicketTool(app: AgentApp): void {
  app.tool('delete-ticket', {
    description: 'Delete (soft-delete) a Zendesk ticket by ID. Returns { success, ticketId }.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'Zendesk ticket ID to delete.',
        },
      },
      required: ['ticketId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { ticketId } = args as { ticketId: string };

      await zendeskRequest(ctx, `/tickets/${ticketId}.json`, {
        method: 'DELETE',
      });

      return { success: true, ticketId };
    },
  });
}
