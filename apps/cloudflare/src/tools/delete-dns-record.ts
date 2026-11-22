/**
 * delete-dns-record — delete a DNS record from a Cloudflare zone.
 */

import type { AgentApp } from '@agentapps/sdk';
import { cloudflareRequest } from '../lib/cloudflare-client.js';

export function registerDeleteDnsRecordTool(app: AgentApp): void {
  app.tool('delete-dns-record', {
    description: 'Delete a DNS record from a Cloudflare zone. This action is irreversible.',
    parameters: {
      type: 'object',
      properties: {
        zoneId: {
          type: 'string',
          description: 'The Cloudflare zone ID.',
        },
        recordId: {
          type: 'string',
          description: 'The DNS record ID to delete.',
        },
      },
      required: ['zoneId', 'recordId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const zoneId = args.zoneId as string;
      const recordId = args.recordId as string;

      return await cloudflareRequest(
        'DELETE',
        `/zones/${zoneId}/dns_records/${recordId}`,
        null,
        ctx,
      );
    },
  });
}
