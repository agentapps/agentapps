/**
 * purge-cache — purge cached content for a Cloudflare zone.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerPurgeCacheTool(app: AgentApp): void {
  app.tool('purge-cache', {
    description:
      'Purge cached content for a Cloudflare zone. Can purge everything or specific files by URL.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: {
          type: 'string',
          description: 'The Cloudflare zone ID.',
        },
        purgeEverything: {
          type: 'boolean',
          description: 'Set to true to purge all cached content for the zone.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of URLs to purge from cache (e.g. ["https://example.com/style.css"]).',
        },
      },
      required: ['zoneId'],
    },
    // A purge cannot be undone: the cache only refills as visitors hit the origin again.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const zoneId = args.zoneId as string;
      const body: Record<string, unknown> = {};
      if (args.purgeEverything) body.purge_everything = true;
      if (args.files) body.files = args.files;

      return await cloudflareRequest('POST', `/zones/${zoneId}/purge_cache`, { body }, ctx);
    },
  });
}
