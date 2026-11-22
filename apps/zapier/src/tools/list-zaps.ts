/**
 * list-zaps — list all user's Zaps via the Zapier API.
 */

import type { AgentApp } from '@agentapps/sdk';
import { zapierRequest } from '../lib/zapier-client.js';

export function registerListZapsTool(app: AgentApp): void {
  app.tool('list-zaps', {
    description:
      'List all Zaps in your Zapier account. Returns an array of Zaps with their IDs, names, and statuses.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      return await zapierRequest('GET', '/zaps/', null, ctx);
    },
  });
}
