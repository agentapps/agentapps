/**
 * create-records — create new records in an Airtable table.
 */

import type { AgentApp } from '@agentapps/sdk';
import { airtableRequest } from '../lib/airtable-client.js';

export function registerCreateRecordsTool(app: AgentApp): void {
  app.tool('create-records', {
    description:
      'Create one or more new records in an Airtable table. Returns the created records with their IDs.',
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
          description: 'Array of records to create. Each record contains a fields object.',
          items: {
            type: 'object',
            properties: {
              fields: {
                type: 'object',
                description: 'Field name-value pairs for the record.',
                additionalProperties: true,
              },
            },
            required: ['fields'],
          },
        },
      },
      required: ['baseId', 'tableIdOrName', 'records'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const baseId = args.baseId as string;
      const tableIdOrName = args.tableIdOrName as string;
      const records = args.records as Array<{ fields: Record<string, unknown> }>;

      return await airtableRequest(
        'POST',
        `/${baseId}/${tableIdOrName}`,
        { body: { records, typecast: true } },
        ctx,
      );
    },
  });
}
