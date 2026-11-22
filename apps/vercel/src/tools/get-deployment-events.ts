/**
 * get_deployment_events — retrieve build logs for a Vercel deployment.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerGetDeploymentEventsTool(app: AgentApp): void {
  app.tool('get_deployment_events', {
    description:
      'Get the build log events for a specific Vercel deployment. Useful for debugging build failures.',
    parameters: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The Vercel deployment ID.',
        },
      },
      required: ['deploymentId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const deploymentId = args.deploymentId as string;
      const data = await vercelRequest('GET', `/v3/deployments/${deploymentId}/events`, null, ctx);
      return { events: data };
    },
  });
}
