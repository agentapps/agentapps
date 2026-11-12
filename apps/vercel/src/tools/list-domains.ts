/**
 * list_domains — list domains in the Vercel account.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerListDomainsTool(app: AgentApp): void {
  app.tool('list_domains', {
    description: 'List domains registered in your Vercel account.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of domains to return (default 20).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        limit: (args.limit as number) || 20,
      };

      const data = (await vercelRequest('GET', '/v5/domains', { params }, ctx)) as Record<
        string,
        unknown
      >;
      return { domains: data.domains, pagination: data.pagination };
    },
  });
}
