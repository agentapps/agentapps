/**
 * create_dns_record — create a new DNS record in a Cloudflare zone.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerCreateDnsRecordTool(app: AgentApp): void {
  app.tool('create_dns_record', {
    description: 'Create a new DNS record in a Cloudflare zone. Returns the created record.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: {
          type: 'string',
          description: 'The Cloudflare zone ID.',
        },
        type: {
          type: 'string',
          description: 'DNS record type (e.g. A, AAAA, CNAME, MX, TXT).',
        },
        name: {
          type: 'string',
          description: 'DNS record name (e.g. sub.example.com or @ for root).',
        },
        content: {
          type: 'string',
          description: 'DNS record content (e.g. IP address, target domain, or text value).',
        },
        ttl: {
          type: 'number',
          description: 'TTL in seconds (1 = automatic, default 1).',
        },
        proxied: {
          type: 'boolean',
          description: 'Whether the record is proxied through Cloudflare (default false).',
        },
      },
      required: ['zoneId', 'type', 'name', 'content'],
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const zoneId = args.zoneId as string;
      const body: Record<string, unknown> = {
        type: args.type,
        name: args.name,
        content: args.content,
      };
      if (args.ttl !== undefined) body.ttl = args.ttl;
      if (args.proxied !== undefined) body.proxied = args.proxied;

      return await cloudflareRequest('POST', `/zones/${zoneId}/dns_records`, { body }, ctx);
    },
  });
}
