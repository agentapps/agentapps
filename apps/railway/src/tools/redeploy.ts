import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-redeploy — Trigger a redeploy of an existing deployment.
 */
export function registerRedeployTool(app: AgentApp): void {
  app.tool('railway-redeploy', {
    description: 'Trigger a redeploy of an existing deployment.',
    parameters: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The Railway deployment ID to redeploy',
        },
      },
      required: ['deploymentId'],
    },
    // Starts a new deployment of the same build on a live service; nothing is deleted.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const deploymentId = (args as Record<string, unknown>).deploymentId as string;
      const client = await createClient(ctx);
      const deployment = await client.redeploy(deploymentId);

      return {
        message: 'Redeploy triggered successfully',
        deploymentId: deployment.id,
        status: deployment.status,
      };
    },
  });
}
