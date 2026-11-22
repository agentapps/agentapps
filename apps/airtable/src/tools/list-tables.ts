/**
 * list-tables — list all tables in an Airtable base.
 */

import type { AgentApp } from '@agentapps/sdk';
import { airtableRequest } from '../lib/airtable-client.js';

export function registerListTablesTool(app: AgentApp): void {
  app.tool('list-tables', {
    description:
      'List all tables in an Airtable base, including their names, IDs, and field definitions.',
    parameters: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The Airtable base ID (e.g. appXXXXXXXXXXXXXX).',
        },
      },
      required: ['baseId'],
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
      return await airtableRequest('GET', `/meta/bases/${baseId}/tables`, {}, ctx);
    },
  });
}
