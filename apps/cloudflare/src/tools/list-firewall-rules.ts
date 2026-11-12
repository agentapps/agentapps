/**
 * list_firewall_rules — list firewall rules for a Cloudflare zone.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerListFirewallRulesTool(app: AgentApp): void {
  app.tool('list_firewall_rules', {
    description:
      'List firewall rules for a Cloudflare zone. Firewall rules match requests using filter expressions and apply actions like block, challenge, or allow.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: {
          type: 'string',
          description: 'The Cloudflare zone ID.',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
        },
        perPage: {
          type: 'number',
          description: 'Number of rules per page (1-100, default 25).',
        },
      },
      required: ['zoneId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const zoneId = args.zoneId as string;
      const params: Record<string, unknown> = {};
      if (args.page) params.page = args.page;
      if (args.perPage) params.per_page = args.perPage;

      return await cloudflareRequest('GET', `/zones/${zoneId}/firewall/rules`, { params }, ctx);
    },
  });
}
