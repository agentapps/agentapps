import type { AgentApp } from '@agentapps/sdk';
import { buildQueryString, factorialRequest } from '../lib/index.js';

export function registerListShiftsTool(app: AgentApp): void {
  app.tool('list-shifts', {
    description: 'List all attendance shifts with optional filters.',
    parameters: {
      type: 'object',
      properties: {
        employeeIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by employee IDs',
        },
        from: { type: 'string', description: 'Start date in ISO format (YYYY-MM-DD)' },
        to: { type: 'string', description: 'End date in ISO format (YYYY-MM-DD)' },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
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
      const qs = buildQueryString({
        employee_ids: args.employeeIds,
        from: args.from,
        to: args.to,
        limit: args.limit,
        offset: args.offset,
      });
      return factorialRequest(ctx, `/attendance/shifts${qs}`);
    },
  });
}
