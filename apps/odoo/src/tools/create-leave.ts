import type { AgentApp } from '@agentapps/sdk';
import { odooCreate, odooRead } from '../lib/odoo-client.js';

/**
 * create-leave — create a new Odoo time-off request (hr.leave).
 */
export function registerCreateLeaveTool(app: AgentApp): void {
  app.tool('create-leave', {
    description: 'Create a new Odoo time-off request (hr.leave).',
    parameters: {
      type: 'object',
      properties: {
        employeeId: { type: 'number', description: 'Employee ID' },
        holidayStatusId: { type: 'number', description: 'Leave type ID' },
        dateFrom: { type: 'string', description: 'Start date/time (ISO 8601)' },
        dateTo: { type: 'string', description: 'End date/time (ISO 8601)' },
        name: { type: 'string', description: 'Reason / description' },
      },
      required: ['employeeId', 'holidayStatusId', 'dateFrom', 'dateTo'],
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
      const leaveId = await odooCreate(ctx, 'hr.leave', {
        employee_id: a.employeeId,
        holiday_status_id: a.holidayStatusId,
        date_from: a.dateFrom,
        date_to: a.dateTo,
        name: a.name,
      });

      return odooRead(ctx, 'hr.leave', leaveId, [
        'id',
        'employee_id',
        'holiday_status_id',
        'date_from',
        'date_to',
        'state',
      ]);
    },
  });
}
