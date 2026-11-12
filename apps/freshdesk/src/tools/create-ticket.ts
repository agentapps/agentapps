import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * create-ticket — POST /tickets
 *
 * Creates a new Freshdesk support ticket.
 */
export function registerCreateTicketTool(app: AgentApp): void {
  app.tool('create-ticket', {
    description:
      'Create a new Freshdesk support ticket (POST /api/v2/tickets). Requires subject, description, and email. Optionally set priority (1=low, 2=medium, 3=high, 4=urgent) and status (2=open, 3=pending, 4=resolved, 5=closed). Returns the created ticket.',
    parameters: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'The subject / title of the ticket.',
        },
        description: {
          type: 'string',
          description: 'HTML description of the ticket.',
        },
        email: {
          type: 'string',
          description: 'Email address of the requester.',
        },
        priority: {
          type: 'number',
          description: 'Ticket priority: 1=low, 2=medium, 3=high, 4=urgent.',
        },
        status: {
          type: 'number',
          description: 'Ticket status: 2=open, 3=pending, 4=resolved, 5=closed.',
        },
      },
      required: ['subject', 'description', 'email'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        subject: args.subject,
        description: args.description,
        email: args.email,
      };
      if (args.priority !== undefined) params.priority = args.priority;
      if (args.status !== undefined) params.status = args.status;

      return await freshdeskRequest('POST', '/tickets', params, ctx);
    },
  });
}
