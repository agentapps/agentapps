/**
 * add_comment — add a comment to an Airtable record.
 */

import type { AgentApp } from '@agentapps/sdk';
import { airtableRequest } from '../lib/airtable-client.js';

export function registerAddCommentTool(app: AgentApp): void {
  app.tool('add_comment', {
    description:
      'Add a comment to a specific record in an Airtable table. Returns the created comment.',
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
        text: {
          type: 'string',
          description: 'The comment text.',
        },
      },
      required: ['baseId', 'tableIdOrName', 'recordId', 'text'],
    },
    // Posts a comment collaborators see: an outside write, a creation rather than a destruction.
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
      const recordId = args.recordId as string;
      const text = args.text as string;

      return await airtableRequest(
        'POST',
        `/${baseId}/${tableIdOrName}/${recordId}/comments`,
        { body: { text } },
        ctx,
      );
    },
  });
}
