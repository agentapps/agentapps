/**
 * list-comments — list comments on an Airtable record.
 */

import type { AgentApp } from '@agentapps/sdk';
import { airtableRequest } from '../lib/airtable-client.js';

export function registerListCommentsTool(app: AgentApp): void {
  app.tool('list-comments', {
    description:
      'List comments on a specific record in an Airtable table. Supports cursor-based pagination via offset.',
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
        offset: {
          type: 'string',
          description: 'Pagination cursor returned from a previous request.',
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
      const params: Record<string, string> = {};
      if (args.offset) params.offset = args.offset as string;

      return await airtableRequest(
        'GET',
        `/${baseId}/${tableIdOrName}/${recordId}/comments`,
        { params },
        ctx,
      );
    },
  });
}
