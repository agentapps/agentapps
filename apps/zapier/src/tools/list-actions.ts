/**
 * list-actions — list available Zapier NLA actions (exposed Zaps).
 */

import type { AgentApp } from '@agentapps/sdk';
import { zapierRequest } from '../lib/zapier-client.js';

export function registerListActionsTool(app: AgentApp): void {
  app.tool('list-actions', {
    description:
      'List all available Zapier actions (exposed Zaps) configured in your Zapier NLA account.',
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
      return await zapierRequest('GET', '/exposed/', null, ctx);
    },
  });
}
