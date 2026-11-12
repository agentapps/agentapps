import type { AgentApp } from '@agentapps/sdk';
import { hubspotRequest } from '../lib/index.js';

/**
 * delete-ticket — DELETE /crm/v3/objects/tickets/{ticketId}.
 *
 * Archives (soft-deletes) the ticket. IRREVERSIBLE via API.
 */
export function registerDeleteTicketTool(app: AgentApp): void {
  app.tool('delete-ticket', {
    description:
      'Archive (soft delete) a HubSpot ticket. Irreversible via API. Returns { success, ticketId }.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: { type: 'string', description: 'HubSpot ticket ID to archive.' },
      },
      required: ['ticketId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { ticketId } = args as { ticketId: string };
      await hubspotRequest(ctx, `/crm/v3/objects/tickets/${encodeURIComponent(ticketId)}`, {
        method: 'DELETE',
      });
      return { success: true, ticketId };
    },
  });
}
