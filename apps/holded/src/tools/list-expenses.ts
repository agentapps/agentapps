/**
 * list_expenses — list Holded expenses.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerListExpensesTool(app: AgentApp): void {
  app.tool('list_expenses', {
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
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      let path = 'invoicing/v1/documents/expense';
      if (args.page) {
        path += `?page=${args.page}`;
      }
      return await holdedRequest('GET', path, null, ctx);
    },
  });
}
