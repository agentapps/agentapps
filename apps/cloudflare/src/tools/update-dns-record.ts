/**
 * update_dns_record — update an existing DNS record in a Cloudflare zone.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerUpdateDnsRecordTool(app: AgentApp): void {
  app.tool('update_dns_record', {
    description:
      'Update an existing DNS record in a Cloudflare zone. Only provided fields are changed.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: {
          type: 'string',
          description: 'The Cloudflare zone ID.',
        },
        recordId: {
          type: 'string',
          description: 'The DNS record ID to update.',
        },
        type: {
          type: 'string',
          description: 'DNS record type (e.g. A, AAAA, CNAME, MX, TXT).',
        },
        name: {
          type: 'string',
          description: 'DNS record name (e.g. sub.example.com).',
        },
        content: {
          type: 'string',
          description: 'DNS record content (e.g. IP address, target domain, or text value).',
        },
        ttl: {
          type: 'number',
          description: 'TTL in seconds (1 = automatic).',
        },
        proxied: {
          type: 'boolean',
          description: 'Whether the record is proxied through Cloudflare.',
        },
      },
      required: ['zoneId', 'recordId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const zoneId = args.zoneId as string;
      const recordId = args.recordId as string;
      const body: Record<string, unknown> = {};
      if (args.type !== undefined) body.type = args.type;
      if (args.name !== undefined) body.name = args.name;
      if (args.content !== undefined) body.content = args.content;
      if (args.ttl !== undefined) body.ttl = args.ttl;
      if (args.proxied !== undefined) body.proxied = args.proxied;

      return await cloudflareRequest(
        'PATCH',
        `/zones/${zoneId}/dns_records/${recordId}`,
        { body },
        ctx,
      );
    },
  });
}
