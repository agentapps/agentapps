import type { AgentApp } from '@agentapps/sdk';
import { odooSearchRead, parseFilters } from '../lib/odoo-client.js';

/**
 * list-timesheets — list Odoo timesheet entries (account.analytic.line).
 */
export function registerListTimesheetsTool(app: AgentApp): void {
  app.tool('list-timesheets', {
    description: 'List Odoo timesheet entries (account.analytic.line).',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'Filter by project ID' },
        taskId: { type: 'number', description: 'Filter by task ID' },
        employeeId: { type: 'number', description: 'Filter by employee ID' },
        dateFrom: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        dateTo: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        filters: { type: 'string', description: 'Additional comma-separated filters' },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        order: { type: 'string', description: 'Order clause, e.g. date desc' },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const domain = parseFilters(a.filters as string | undefined);
      if (a.projectId) {
        domain.push(['project_id', '=', a.projectId as number]);
      }
      if (a.taskId) {
        domain.push(['task_id', '=', a.taskId as number]);
      }
      if (a.employeeId) {
        domain.push(['employee_id', '=', a.employeeId as number]);
      }
      if (a.dateFrom) {
        domain.push(['date', '>=', a.dateFrom as string]);
      }
      if (a.dateTo) {
        domain.push(['date', '<=', a.dateTo as string]);
      }

      return odooSearchRead(ctx, 'account.analytic.line', {
        domain,
        fields: ['id', 'date', 'employee_id', 'project_id', 'task_id', 'name', 'unit_amount'],
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        order: a.order as string | undefined,
      });
    },
  });
}
