/**
 * get_deployment — retrieve a single Vercel deployment by ID or URL.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerGetDeploymentTool(app: AgentApp): void {
  app.tool('get_deployment', {
    description: 'Get detailed information about a specific Vercel deployment by its ID or URL.',
    parameters: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The Vercel deployment ID or URL.',
        },
      },
      required: ['deploymentId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const deploymentId = args.deploymentId as string;
      return await vercelRequest('GET', `/v13/deployments/${deploymentId}`, null, ctx);
    },
  });
}
