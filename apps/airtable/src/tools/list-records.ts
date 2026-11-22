/**
 * list-records — list records from an Airtable table with optional filtering and sorting.
 */

import type { AgentApp } from '@agentapps/sdk';
import { airtableRequest } from '../lib/airtable-client.js';

export function registerListRecordsTool(app: AgentApp): void {
  app.tool('list-records', {
    description:
      'List records from an Airtable table. Supports filtering with Airtable formulas, field selection, sorting, and pagination.',
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
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Field names to include in the response. Omit to return all fields.',
        },
        filterByFormula: {
          type: 'string',
          description: 'An Airtable formula to filter records (e.g. "{Status} = \'Done\'").',
        },
        maxRecords: {
          type: 'number',
          description: 'Maximum number of records to return (default 100).',
        },
        sort: {
          type: 'array',
          description: 'Sort order for the records.',
          items: {
            type: 'object',
            properties: {
              field: {
                type: 'string',
                description: 'Field name to sort by.',
              },
              direction: {
                type: 'string',
                enum: ['asc', 'desc'],
                description: 'Sort direction (default "asc").',
              },
            },
            required: ['field'],
          },
        },
        offset: {
          type: 'string',
          description: 'Pagination cursor returned from a previous request.',
        },
      },
      required: ['baseId', 'tableIdOrName'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const baseId = args.baseId as string;
      const tableIdOrName = args.tableIdOrName as string;
      const params: Record<string, string | string[]> = {};

      if (args.fields) {
        params['fields[]'] = args.fields as string[];
      }
      if (args.filterByFormula) {
        params.filterByFormula = args.filterByFormula as string;
      }
      params.maxRecords = String((args.maxRecords as number) || 100);

      if (args.sort) {
        const sortItems = args.sort as Array<{ field: string; direction?: string }>;
        for (let i = 0; i < sortItems.length; i++) {
          params[`sort[${i}][field]`] = sortItems[i].field;
          if (sortItems[i].direction) {
            params[`sort[${i}][direction]`] = sortItems[i].direction!;
          }
        }
      }
      if (args.offset) {
        params.offset = args.offset as string;
      }

      return await airtableRequest('GET', `/${baseId}/${tableIdOrName}`, { params }, ctx);
    },
  });
}
