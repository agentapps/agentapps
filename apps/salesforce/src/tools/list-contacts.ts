import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * list-contacts — List Salesforce contacts via SOQL query.
 * GET /services/data/v59.0/query?q=SELECT Id,FirstName,LastName,Email FROM Contact LIMIT {limit}
 */
export function registerListContactsTool(app: AgentApp): void {
  app.tool('list-contacts', {
    description:
      'List Salesforce contacts. Returns contacts with Id, FirstName, LastName, and Email. Params: limit (1-200, default 50).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of contacts to return. Min 1, max 200, default 50.',
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

      const soql = `SELECT Id, FirstName, LastName, Email FROM Contact LIMIT ${safeLimit}`;
      const data = (await salesforceRequest(
        'GET',
        `query?q=${encodeURIComponent(soql)}`,
        undefined,
        ctx,
      )) as any;

      return {
        totalSize: data.totalSize ?? 0,
        contacts: (data.records ?? []).map((r: any) => ({
          id: r.Id,
          firstName: r.FirstName ?? null,
          lastName: r.LastName ?? null,
          email: r.Email ?? null,
        })),
      };
    },
  });
}
