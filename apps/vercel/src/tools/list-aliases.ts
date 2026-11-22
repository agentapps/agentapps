/**
 * list-aliases — list aliases (custom domains assigned to deployments).
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerListAliasesTool(app: AgentApp): void {
  app.tool('list-aliases', {
    description:
      'List aliases in your Vercel account. Aliases are custom domains or generated URLs assigned to deployments.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Filter aliases by project ID.',
        },
        limit: {
          type: 'number',
          description: 'Number of aliases to return (default 20).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        limit: (args.limit as number) || 20,
      };
      if (args.projectId) params.projectId = args.projectId;

      const data = (await vercelRequest('GET', '/v4/aliases', { params }, ctx)) as Record<
        string,
        unknown
      >;
      return { aliases: data.aliases, pagination: data.pagination };
    },
  });
}
