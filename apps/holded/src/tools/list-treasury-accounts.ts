/**
 * list_treasury_accounts — list Holded treasury (bank) accounts.
 */

import type { AgentApp } from '@agentapps/sdk';
import { holdedRequest } from '../lib/holded-client.js';

export function registerListTreasuryAccountsTool(app: AgentApp): void {
  app.tool('list_treasury_accounts', {
    description:
      'List treasury (bank) accounts from your Holded account. Shows balances and account details.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: true },
    handler: async (_args, ctx) => {
      return await holdedRequest('GET', 'treasury/v1/accounts', null, ctx);
    },
  });
}
