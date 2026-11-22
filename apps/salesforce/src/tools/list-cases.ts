import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * list-cases — List Salesforce cases via SOQL query.
 * GET /services/data/v59.0/query?q=SELECT Id,Subject,Status,Priority FROM Case LIMIT {limit}
 */
export function registerListCasesTool(app: AgentApp): void {
  app.tool('list-cases', {
    description:
      'List Salesforce cases. Returns cases with Id, Subject, Status, and Priority. Params: limit (1-200, default 50).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of cases to return. Min 1, max 200, default 50.',
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

      const soql = `SELECT Id, Subject, Status, Priority FROM Case LIMIT ${safeLimit}`;
      const data = (await salesforceRequest(
        'GET',
        `query?q=${encodeURIComponent(soql)}`,
        undefined,
        ctx,
      )) as any;

      return {
        totalSize: data.totalSize ?? 0,
        cases: (data.records ?? []).map((r: any) => ({
          id: r.Id,
          subject: r.Subject ?? null,
          status: r.Status ?? null,
          priority: r.Priority ?? null,
        })),
      };
    },
  });
}
