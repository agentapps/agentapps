/**
 * list_page_rules — list page rules for a Cloudflare zone.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerListPageRulesTool(app: AgentApp): void {
  app.tool('list_page_rules', {
    description:
      'List all page rules for a Cloudflare zone. Page rules control zone-level settings by URL pattern.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: {
          type: 'string',
          description: 'The Cloudflare zone ID.',
        },
        status: {
          type: 'string',
          description: 'Filter by status (active or disabled).',
        },
        order: {
          type: 'string',
          description: 'Sort order for results (status, priority).',
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
      const params: Record<string, unknown> = {};
      if (args.status) params.status = args.status;
      if (args.order) params.order = args.order;

      return await cloudflareRequest('GET', `/zones/${zoneId}/pagerules`, { params }, ctx);
    },
  });
}
