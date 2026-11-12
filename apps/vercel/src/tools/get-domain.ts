/**
 * get_domain — retrieve details about a specific domain.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerGetDomainTool(app: AgentApp): void {
  app.tool('get_domain', {
    description: 'Get detailed information about a specific domain in your Vercel account.',
    parameters: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'The domain name (e.g. example.com).',
        },
      },
      required: ['domain'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const domain = args.domain as string;
      return await vercelRequest('GET', `/v5/domains/${domain}`, null, ctx);
    },
  });
}
