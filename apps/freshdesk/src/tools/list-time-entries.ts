import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * list-time-entries — GET /tickets/{ticketId}/time_entries
 *
 * Lists all time entries logged against a Freshdesk ticket.
 */
export function registerListTimeEntriesTool(app: AgentApp): void {
  app.tool('list-time-entries', {
    description:
      'List time entries for a Freshdesk ticket (GET /api/v2/tickets/{ticketId}/time_entries). Optional pagination: page, per_page. Returns time entry id, agent_id, billable, time_spent, note, and timestamps.',
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
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const ticketId = args.ticketId as number;
      const a = args as Record<string, unknown>;
      const params: Record<string, unknown> = {};
      if (a.page !== undefined) params.page = a.page;
      if (a.per_page !== undefined) params.per_page = a.per_page;

      const hasParams = Object.keys(params).length > 0;
      const timeEntries = await freshdeskRequest<unknown[]>(
        'GET',
        `/tickets/${ticketId}/time_entries`,
        hasParams ? params : undefined,
        ctx,
      );

      return { count: timeEntries.length, time_entries: timeEntries };
    },
  });
}
