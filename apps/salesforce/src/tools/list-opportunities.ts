import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * list-opportunities — List Salesforce opportunities via SOQL query.
 * GET /services/data/v59.0/query?q=SELECT Id,Name,StageName,Amount FROM Opportunity LIMIT {limit}
 */
export function registerListOpportunitiesTool(app: AgentApp): void {
  app.tool('list-opportunities', {
    description:
      'List Salesforce opportunities. Returns opportunities with Id, Name, StageName, and Amount. Params: limit (1-200, default 50).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of opportunities to return. Min 1, max 200, default 50.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { limit = 50 } = (args ?? {}) as { limit?: number };
      const safeLimit = Math.min(Math.max(limit, 1), 200);

      const soql = `SELECT Id, Name, StageName, Amount FROM Opportunity LIMIT ${safeLimit}`;
      const data = (await salesforceRequest(
        'GET',
        `query?q=${encodeURIComponent(soql)}`,
        undefined,
        ctx,
      )) as any;

      return {
        totalSize: data.totalSize ?? 0,
        opportunities: (data.records ?? []).map((r: any) => ({
          id: r.Id,
          name: r.Name ?? null,
          stageName: r.StageName ?? null,
          amount: r.Amount ?? null,
        })),
      };
    },
  });
}
