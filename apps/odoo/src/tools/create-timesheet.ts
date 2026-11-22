import type { AgentApp } from '@agentapps/sdk';
import { odooCreate, odooRead } from '../lib/odoo-client.js';

/**
 * create-timesheet — create a new Odoo timesheet entry (account.analytic.line).
 */
export function registerCreateTimesheetTool(app: AgentApp): void {
  app.tool('create-timesheet', {
    description: 'Create a new Odoo timesheet entry (account.analytic.line).',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'Project ID' },
        taskId: { type: 'number', description: 'Task ID (optional)' },
        employeeId: { type: 'number', description: 'Employee ID' },
        date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
        name: { type: 'string', description: 'Description of the work done' },
        hours: { type: 'number', description: 'Hours spent' },
      },
      required: ['projectId', 'employeeId', 'date', 'name', 'hours'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const timesheetId = await odooCreate(ctx, 'account.analytic.line', {
        project_id: a.projectId,
        task_id: a.taskId,
        employee_id: a.employeeId,
        date: a.date,
        name: a.name,
        unit_amount: a.hours,
      });

      return odooRead(ctx, 'account.analytic.line', timesheetId, [
        'id',
        'date',
        'employee_id',
        'project_id',
        'task_id',
        'name',
        'unit_amount',
      ]);
    },
  });
}
