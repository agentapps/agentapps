/**
 * cancel_deployment — cancel an in-progress Vercel deployment.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerCancelDeploymentTool(app: AgentApp): void {
  app.tool('cancel_deployment', {
    description:
      'Cancel an in-progress Vercel deployment. Only works for deployments that are currently building or queued.',
    parameters: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The Vercel deployment ID to cancel.',
        },
      },
      required: ['deploymentId'],
    },
    annotations: {
      readOnlyHint: false,
      // A cancelled build cannot resume, but redeploy builds the same deployment again.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const deploymentId = args.deploymentId as string;
      return await vercelRequest('PATCH', `/v12/deployments/${deploymentId}/cancel`, null, ctx);
    },
  });
}
