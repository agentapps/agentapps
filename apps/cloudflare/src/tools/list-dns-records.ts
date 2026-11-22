/**
 * list_dns_records — list DNS records for a Cloudflare zone.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerListDnsRecordsTool(app: AgentApp): void {
  app.tool('list_dns_records', {
    description:
      'List DNS records for a zone. Supports filtering by record type and name, with pagination.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: {
          type: 'string',
          description: 'The Cloudflare zone ID.',
        },
        type: {
          type: 'string',
          description: 'Filter by DNS record type (e.g. A, AAAA, CNAME, MX, TXT).',
        },
        name: {
          type: 'string',
          description: 'Filter by DNS record name (e.g. sub.example.com).',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
        },
        perPage: {
          type: 'number',
          description: 'Number of records per page (1-100, default 20).',
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
      if (args.type) params.type = args.type;
      if (args.name) params.name = args.name;
      if (args.page) params.page = args.page;
      if (args.perPage) params.per_page = args.perPage;

      return await cloudflareRequest('GET', `/zones/${zoneId}/dns_records`, { params }, ctx);
    },
  });
}
