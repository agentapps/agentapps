import type { AgentApp } from '@agentapps/sdk';
import { buildQueryString, factorialRequest } from '../lib/index.js';

export function registerListOvertimeRequestsTool(app: AgentApp): void {
  app.tool('list-overtime-requests', {
    description: 'List overtime requests with optional filters.',
    parameters: {
      type: 'object',
      properties: {
        employeeIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by employee IDs',
        },
        status: {
          type: 'string',
          description: 'Filter by status: pending, approved, rejected',
          enum: ['pending', 'approved', 'rejected'],
        },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const qs = buildQueryString({
        employee_ids: args.employeeIds,
        status: args.status,
        limit: args.limit,
        offset: args.offset,
      });
      return factorialRequest(ctx, `/attendance/overtime_requests${qs}`);
    },
  });
}
