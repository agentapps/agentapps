import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * get-ticket — GET /tickets/{ticketId}
 *
 * Retrieves a single Freshdesk ticket by its ID.
 */
export function registerGetTicketTool(app: AgentApp): void {
  app.tool('get-ticket', {
    description:
      'Get detailed information about a specific Freshdesk support ticket by its ID (GET /api/v2/tickets/{ticketId}). Returns subject, description, status, priority, requester, agent, timestamps, and custom fields.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The Freshdesk ticket ID.',
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
      return await freshdeskRequest('GET', `/tickets/${ticketId}`, undefined, ctx);
    },
  });
}
