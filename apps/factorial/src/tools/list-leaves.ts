import type { AgentApp } from '@agentapps/sdk';
import { buildQueryString, factorialRequest } from '../lib/index.js';

export function registerListLeavesTool(app: AgentApp): void {
  app.tool('list-leaves', {
    description: 'List time-off requests (leaves) with optional filters.',
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
        from: { type: 'string', description: 'Start date in ISO format (YYYY-MM-DD)' },
        to: { type: 'string', description: 'End date in ISO format (YYYY-MM-DD)' },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const qs = buildQueryString({
        employee_ids: args.employeeIds,
        status: args.status,
        from: args.from,
        to: args.to,
        limit: args.limit,
        offset: args.offset,
      });
      return factorialRequest(ctx, `/timeoff/leaves${qs}`);
    },
  });
}
