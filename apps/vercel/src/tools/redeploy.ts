/**
 * redeploy — redeploy an existing Vercel deployment.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerRedeployTool(app: AgentApp): void {
  app.tool('redeploy', {
    description:
      'Redeploy an existing Vercel deployment. Creates a new deployment using the same source and configuration as the specified deployment.',
    parameters: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The ID of the deployment to redeploy.',
        },
        target: {
          type: 'string',
          enum: ['production', 'preview'],
          description: 'The target environment for the redeployment (default: same as original).',
        },
      },
      required: ['deploymentId'],
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const deploymentId = args.deploymentId as string;
      const body: Record<string, unknown> = {
        deploymentId,
      };
      if (args.target) body.target = args.target;

      const params: Record<string, unknown> = {
        forceNew: '1',
      };

      return await vercelRequest('POST', '/v13/deployments', { body, params }, ctx);
    },
  });
}
