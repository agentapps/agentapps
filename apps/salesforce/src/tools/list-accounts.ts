import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * list-accounts — List Salesforce accounts via SOQL query.
 * GET /services/data/v59.0/query?q=SELECT Id,Name,Industry,Phone FROM Account LIMIT {limit}
 */
export function registerListAccountsTool(app: AgentApp): void {
  app.tool('list-accounts', {
    description:
      'List Salesforce accounts. Returns accounts with Id, Name, Industry, and Phone. Params: limit (1-200, default 50).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of accounts to return. Min 1, max 200, default 50.',
        },
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
      const { limit = 50 } = (args ?? {}) as { limit?: number };
      const safeLimit = Math.min(Math.max(limit, 1), 200);

      const soql = `SELECT Id, Name, Industry, Phone FROM Account LIMIT ${safeLimit}`;
      const data = (await salesforceRequest(
        'GET',
        `query?q=${encodeURIComponent(soql)}`,
        undefined,
        ctx,
      )) as any;

      return {
        totalSize: data.totalSize ?? 0,
        accounts: (data.records ?? []).map((r: any) => ({
          id: r.Id,
          name: r.Name,
          industry: r.Industry ?? null,
          phone: r.Phone ?? null,
        })),
      };
    },
  });
}
