/**
 * list-contacts — list Holded contacts.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerListContactsTool(app: AgentApp): void {
  app.tool('list-contacts', {
    description:
      'List contacts from your Holded account. Returns customers, suppliers, and other contacts.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
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
      let path = 'invoicing/v1/contacts';
      if (args.page) {
        path += `?page=${args.page}`;
      }
      return await holdedRequest('GET', path, null, ctx);
    },
  });
}
