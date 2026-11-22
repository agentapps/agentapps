/**
 * list_bases — list all Airtable bases accessible to the user.
 */

import type { AgentApp } from '@agentapps/sdk';
import { airtableRequest } from '../lib/airtable-client.js';

export function registerListBasesTool(app: AgentApp): void {
  app.tool('list_bases', {
    description:
      'List all Airtable bases accessible to the authenticated user. Supports cursor-based pagination via offset.',
    parameters: {
      type: 'object',
      properties: {
        offset: {
          type: 'string',
          description: 'Pagination cursor returned from a previous request.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const params: Record<string, string> = {};
      if (args.offset) params.offset = args.offset as string;

      return await airtableRequest('GET', '/meta/bases', { params }, ctx);
    },
  });
}
