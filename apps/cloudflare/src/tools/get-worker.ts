/**
 * get-worker — retrieve details about a specific Workers script.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerGetWorkerTool(app: AgentApp): void {
  app.tool('get-worker', {
    description:
      'Get metadata about a specific Workers script by name, including bindings, compatibility date, and usage model.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'The Cloudflare account ID.',
        },
        scriptName: {
          type: 'string',
          description: 'The name of the Workers script.',
        },
      },
      required: ['accountId', 'scriptName'],
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
      const scriptName = args.scriptName as string;
      return await cloudflareRequest(
        'GET',
        `/accounts/${accountId}/workers/scripts/${scriptName}`,
        null,
        ctx,
      );
    },
  });
}
