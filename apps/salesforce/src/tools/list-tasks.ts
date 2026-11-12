import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * list-tasks — List Salesforce tasks via SOQL query.
 * GET /services/data/v59.0/query?q=SELECT Id,Subject,Status,Priority FROM Task LIMIT {limit}
 */
export function registerListTasksTool(app: AgentApp): void {
  app.tool('list-tasks', {
    description:
      'List Salesforce tasks. Returns tasks with Id, Subject, Status, and Priority. Params: limit (1-200, default 50).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return. Min 1, max 200, default 50.',
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

      const soql = `SELECT Id, Subject, Status, Priority FROM Task LIMIT ${safeLimit}`;
      const data = (await salesforceRequest(
        'GET',
        `query?q=${encodeURIComponent(soql)}`,
        undefined,
        ctx,
      )) as any;

      return {
        totalSize: data.totalSize ?? 0,
        tasks: (data.records ?? []).map((r: any) => ({
          id: r.Id,
          subject: r.Subject ?? null,
          status: r.Status ?? null,
          priority: r.Priority ?? null,
        })),
      };
    },
  });
}
