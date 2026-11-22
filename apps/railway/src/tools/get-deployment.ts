import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * get-deployment — Get the status of a specific deployment.
 */
export function registerGetDeploymentTool(app: AgentApp): void {
  app.tool('get-deployment', {
    description: 'Get the status of a specific deployment.',
    parameters: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The Railway deployment ID',
        },
      },
      required: ['deploymentId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const deploymentId = (args as Record<string, unknown>).deploymentId as string;
      const client = await createClient(ctx);
      const deployment = await client.getDeployment(deploymentId);

      if (!deployment) {
        throw new Error(`Deployment not found: ${deploymentId}`);
      }

      return {
        id: deployment.id,
        status: deployment.status,
        createdAt: deployment.createdAt,
        updatedAt: deployment.updatedAt,
        url: deployment.staticUrl || null,
      };
    },
  });
}
