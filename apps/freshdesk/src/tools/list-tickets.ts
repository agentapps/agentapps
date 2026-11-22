import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * list-tickets — GET /tickets
 *
 * Lists tickets from the Freshdesk helpdesk. Supports filtering by status,
 * priority, and pagination.
 */
export function registerListTicketsTool(app: AgentApp): void {
  app.tool('list-tickets', {
    description:
      'List Freshdesk support tickets (GET /api/v2/tickets). Optional filters: status (2=open, 3=pending, 4=resolved, 5=closed), priority (1=low, 2=medium, 3=high, 4=urgent), page, per_page (default 30, max 100). Returns ticket id, subject, status, priority, requester, agent, timestamps.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'number',
          description: 'Filter by status: 2=open, 3=pending, 4=resolved, 5=closed.',
        },
        priority: {
          type: 'number',
          description: 'Filter by priority: 1=low, 2=medium, 3=high, 4=urgent.',
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
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const params: Record<string, unknown> = {};
      if (a.status !== undefined) params.status = a.status;
      if (a.priority !== undefined) params.priority = a.priority;
      if (a.page !== undefined) params.page = a.page;
      if (a.per_page !== undefined) params.per_page = a.per_page;

      const hasParams = Object.keys(params).length > 0;
      const tickets = await freshdeskRequest<unknown[]>(
        'GET',
        '/tickets',
        hasParams ? params : undefined,
        ctx,
      );

      return { count: tickets.length, tickets };
    },
  });
}
