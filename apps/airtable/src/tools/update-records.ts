/**
 * update_records — update existing records in an Airtable table.
 */

import type { AgentApp } from '@agentapps/sdk';
import { airtableRequest } from '../lib/airtable-client.js';

export function registerUpdateRecordsTool(app: AgentApp): void {
  app.tool('update_records', {
    description:
      'Update one or more existing records in an Airtable table. Each record must include its ID and the fields to update.',
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
        records: {
          type: 'array',
          description:
            'Array of records to update. Each record must include an id and fields object.',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The record ID (e.g. recXXXXXXXXXXXXXX).',
              },
              fields: {
                type: 'object',
                description: 'Field name-value pairs to update.',
                additionalProperties: true,
              },
            },
            required: ['id', 'fields'],
          },
        },
      },
      required: ['baseId', 'tableIdOrName', 'records'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const baseId = args.baseId as string;
      const tableIdOrName = args.tableIdOrName as string;
      const records = args.records as Array<{ id: string; fields: Record<string, unknown> }>;

      return await airtableRequest(
        'PATCH',
        `/${baseId}/${tableIdOrName}`,
        { body: { records, typecast: true } },
        ctx,
      );
    },
  });
}
