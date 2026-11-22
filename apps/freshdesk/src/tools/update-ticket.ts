import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * update-ticket — PUT /tickets/{ticketId}
 *
 * Updates an existing Freshdesk support ticket.
 */
export function registerUpdateTicketTool(app: AgentApp): void {
  app.tool('update-ticket', {
    description:
      'Update an existing Freshdesk support ticket (PUT /api/v2/tickets/{ticketId}). Can change status (2=open, 3=pending, 4=resolved, 5=closed), priority (1=low, 2=medium, 3=high, 4=urgent), subject, or description. Returns the updated ticket.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The Freshdesk ticket ID to update.',
        },
        status: {
          type: 'number',
          description: 'New status: 2=open, 3=pending, 4=resolved, 5=closed.',
        },
        priority: {
          type: 'number',
          description: 'New priority: 1=low, 2=medium, 3=high, 4=urgent.',
        },
        subject: {
          type: 'string',
          description: 'New subject / title for the ticket.',
        },
        description: {
          type: 'string',
          description: 'New HTML description for the ticket.',
        },
      },
      required: ['ticketId'],
    },
    // Setting the fields again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const ticketId = args.ticketId as number;
      const params: Record<string, unknown> = {};
      if (args.status !== undefined) params.status = args.status;
      if (args.priority !== undefined) params.priority = args.priority;
      if (args.subject !== undefined) params.subject = args.subject;
      if (args.description !== undefined) params.description = args.description;

      return await freshdeskRequest('PUT', `/tickets/${ticketId}`, params, ctx);
    },
  });
}
