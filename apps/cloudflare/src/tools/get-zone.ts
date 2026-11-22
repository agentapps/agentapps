/**
 * get_zone — retrieve details about a specific Cloudflare zone.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerGetZoneTool(app: AgentApp): void {
  app.tool('get_zone', {
    description: 'Get detailed information about a specific Cloudflare zone by its ID.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: {
          type: 'string',
          description: 'The Cloudflare zone ID.',
        },
      },
      required: ['zoneId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const zoneId = args.zoneId as string;
      return await cloudflareRequest('GET', `/zones/${zoneId}`, null, ctx);
    },
  });
}
