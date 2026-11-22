/**
 * list-expenses — list Holded expenses.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerListExpensesTool(app: AgentApp): void {
  app.tool('list-expenses', {
    description: 'List expenses from your Holded account. Returns all expense documents.',
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
      let path = 'invoicing/v1/documents/expense';
      if (args.page) {
        path += `?page=${args.page}`;
      }
      return await holdedRequest('GET', path, null, ctx);
    },
  });
}
