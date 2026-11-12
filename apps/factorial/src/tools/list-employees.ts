import type { AgentApp } from '@agentapps/sdk';
import { buildQueryString, factorialRequest } from '../lib/index.js';

export function registerListEmployeesTool(app: AgentApp): void {
  app.tool('list-employees', {
    description: 'List all employees in the company with optional filters.',
    parameters: {
      type: 'object',
      properties: {
        active: { type: 'boolean', description: 'Filter by active status' },
        teamIds: { type: 'array', items: { type: 'number' }, description: 'Filter by team IDs' },
        locationIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by location IDs',
        },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const qs = buildQueryString({
        active: args.active,
        team_ids: args.teamIds,
        location_ids: args.locationIds,
        limit: args.limit,
        offset: args.offset,
      });
      return factorialRequest(ctx, `/employees/employees${qs}`);
    },
  });
}
