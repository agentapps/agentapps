import type { AgentApp } from '@agentapps/sdk';
import { buildQueryString, factorialRequest } from '../lib/index.js';

export function registerListContractVersionsTool(app: AgentApp): void {
  app.tool('list-contract-versions', {
    description: 'List all employee contract versions.',
    parameters: {
      type: 'object',
      properties: {
        employeeIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by employee IDs',
        },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const qs = buildQueryString({
        employee_ids: args.employeeIds,
        limit: args.limit,
        offset: args.offset,
      });
      return factorialRequest(ctx, `/contracts/contract_versions${qs}`);
    },
  });
}
