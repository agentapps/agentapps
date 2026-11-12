/**
 * delete_records — delete records from an Airtable table.
 */

import type { AgentApp } from '@agentapps/sdk';
import { airtableRequest } from '../lib/airtable-client.js';

export function registerDeleteRecordsTool(app: AgentApp): void {
  app.tool('delete_records', {
    description:
      'Delete one or more records from an Airtable table by their IDs (up to 10 at a time).',
    parameters: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The Airtable base ID (e.g. appXXXXXXXXXXXXXX).',
        },
        tableIdOrName: {
          type: 'string',
          description: 'The table ID (e.g. tblXXXXXXXXXXXXXX) or table name.',
        },
        recordIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of record IDs to delete (up to 10).',
        },
      },
      required: ['baseId', 'tableIdOrName', 'recordIds'],
    },
    annotations: { sensitive: true, readOnlyHint: false, destructiveHint: true },
    handler: async (args, ctx) => {
      const baseId = args.baseId as string;
      const tableIdOrName = args.tableIdOrName as string;
      const recordIds = args.recordIds as string[];

      const params: Record<string, string[]> = {
        'records[]': recordIds,
      };

      return await airtableRequest('DELETE', `/${baseId}/${tableIdOrName}`, { params }, ctx);
    },
  });
}
