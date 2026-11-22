import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * query — Execute a SOQL query against Salesforce.
 * GET /services/data/v59.0/query?q={soql}
 */
export function registerQueryTool(app: AgentApp): void {
  app.tool('query', {
    description:
      'Execute a SOQL query against Salesforce. Returns query results with totalSize, done flag, and records array. Params: soql (required).',
    parameters: {
      type: 'object',
      properties: {
        soql: {
          type: 'string',
          description: 'SOQL query string (e.g. "SELECT Id, Name FROM Account LIMIT 10").',
        },
      },
      required: ['soql'],
    },
    // SOQL sent to the query endpoint with GET can only select; it cannot write.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { soql } = args as { soql: string };

      const data = (await salesforceRequest(
        'GET',
        `query?q=${encodeURIComponent(soql)}`,
        undefined,
        ctx,
      )) as any;

      return {
        totalSize: data.totalSize ?? 0,
        done: data.done ?? true,
        records: data.records ?? [],
        nextRecordsUrl: data.nextRecordsUrl ?? null,
      };
    },
  });
}
