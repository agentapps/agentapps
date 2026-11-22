import type { AgentApp } from '@agentapps/sdk';
import { odooSearchRead, parseFilters } from '../lib/odoo-client.js';

/**
 * list-leaves — list Odoo time-off requests (hr.leave).
 */
export function registerListLeavesTool(app: AgentApp): void {
  app.tool('list-leaves', {
    description: 'List Odoo time-off requests (hr.leave).',
    parameters: {
      type: 'object',
      properties: {
        employeeId: { type: 'number', description: 'Filter by employee ID' },
        state: { type: 'string', description: 'Filter by state: draft, confirm, validate, refuse' },
        filters: { type: 'string', description: 'Additional comma-separated filters' },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        order: { type: 'string', description: 'Order clause, e.g. date_from desc' },
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
      const a = (args ?? {}) as Record<string, unknown>;
      const domain = parseFilters(a.filters as string | undefined);
      if (a.employeeId) {
        domain.push(['employee_id', '=', a.employeeId as number]);
      }
      if (a.state) {
        domain.push(['state', '=', a.state as string]);
      }

      return odooSearchRead(ctx, 'hr.leave', {
        domain,
        fields: [
          'id',
          'employee_id',
          'holiday_status_id',
          'date_from',
          'date_to',
          'state',
          'number_of_days',
        ],
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        order: a.order as string | undefined,
      });
    },
  });
}
