/**
 * get-record — retrieve a single record from an Airtable table.
 */

import type { AgentApp } from '@agentapps/sdk';
import { airtableRequest } from '../lib/airtable-client.js';

export function registerGetRecordTool(app: AgentApp): void {
  app.tool('get-record', {
    description: 'Get a single record from an Airtable table by its record ID.',
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
        recordId: {
          type: 'string',
          description: 'The record ID (e.g. recXXXXXXXXXXXXXX).',
        },
      },
      required: ['baseId', 'tableIdOrName', 'recordId'],
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
      const recordId = args.recordId as string;

      return await airtableRequest('GET', `/${baseId}/${tableIdOrName}/${recordId}`, {}, ctx);
    },
  });
}
