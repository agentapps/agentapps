/**
 * add-domain — add a domain to a Vercel project.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerAddDomainTool(app: AgentApp): void {
  app.tool('add-domain', {
    description:
      'Add a domain to a Vercel project. The domain must be verified in your Vercel account or will be added for verification.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Vercel project name or ID.',
        },
        name: {
          type: 'string',
          description: 'The domain name to add (e.g. example.com).',
        },
      },
      required: ['projectId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const projectId = args.projectId as string;
      const body: Record<string, unknown> = {
        name: args.name,
      };

      return await vercelRequest('POST', `/v10/projects/${projectId}/domains`, { body }, ctx);
    },
  });
}
