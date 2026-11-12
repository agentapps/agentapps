import type { AgentApp } from '@agentapps/sdk';
import { odooSearchRead, parseFilters } from '../lib/odoo-client.js';

/**
 * list-employees — list Odoo employees (hr.employee).
 */
export function registerListEmployeesTool(app: AgentApp): void {
  app.tool('list-employees', {
    description: 'List Odoo employees (hr.employee).',
    parameters: {
      type: 'object',
      properties: {
        filters: { type: 'string', description: 'Comma-separated filters' },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        order: { type: 'string', description: 'Order clause, e.g. name asc' },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      return odooSearchRead(ctx, 'hr.employee', {
        domain: parseFilters(a.filters as string | undefined),
        fields: ['id', 'name', 'work_email', 'work_phone', 'department_id', 'job_id', 'parent_id'],
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        order: a.order as string | undefined,
      });
    },
  });
}
