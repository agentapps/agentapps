/**
 * get-project — retrieve a single Vercel project by name or ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerGetProjectTool(app: AgentApp): void {
  app.tool('get-project', {
    description: 'Get detailed information about a specific Vercel project by its name or ID.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Vercel project name or ID.',
        },
      },
      required: ['projectId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const projectId = args.projectId as string;
      return await vercelRequest('GET', `/v9/projects/${projectId}`, null, ctx);
    },
  });
}
