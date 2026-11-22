/**
 * list_workers — list Workers scripts for a Cloudflare account.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerListWorkersTool(app: AgentApp): void {
  app.tool('list_workers', {
    description: 'List all Workers scripts in a Cloudflare account.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'The Cloudflare account ID.',
        },
      },
      required: ['accountId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const accountId = args.accountId as string;
      return await cloudflareRequest('GET', `/accounts/${accountId}/workers/scripts`, null, ctx);
    },
  });
}
