import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * list-users — List Salesforce users via SOQL query.
 * GET /services/data/v59.0/query?q=SELECT Id,Name,Email,IsActive FROM User LIMIT {limit}
 */
export function registerListUsersTool(app: AgentApp): void {
  app.tool('list-users', {
    description:
      'List Salesforce users. Returns users with Id, Name, Email, and IsActive. Params: limit (1-200, default 50).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of users to return. Min 1, max 200, default 50.',
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

      const soql = `SELECT Id, Name, Email, IsActive FROM User LIMIT ${safeLimit}`;
      const data = (await salesforceRequest(
        'GET',
        `query?q=${encodeURIComponent(soql)}`,
        undefined,
        ctx,
      )) as any;

      return {
        totalSize: data.totalSize ?? 0,
        users: (data.records ?? []).map((r: any) => ({
          id: r.Id,
          name: r.Name ?? null,
          email: r.Email ?? null,
          isActive: r.IsActive ?? null,
        })),
      };
    },
  });
}
