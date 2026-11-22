import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderDeploy {
  id: string;
  status: string;
}

/**
 * rollback-deploy -- POST /services/{serviceId}/deploys/{deployId}/rollback.
 */
export function registerRollbackDeployTool(app: AgentApp): void {
  app.tool('rollback-deploy', {
    description:
      'Roll back a Render service to a specific previous deploy. Returns { newDeployId, status }. Params: serviceId (required), deployId (required -- the deploy ID to roll back to).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        deployId: {
          type: 'string',
          description: 'The deploy ID to roll back to.',
        },
      },
      required: ['serviceId', 'deployId'],
    },
    // Starts a new deploy of an older build; deploying the newer one again undoes it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { serviceId, deployId } = args as { serviceId: string; deployId: string };
      const deploy = await renderRequest<RenderDeploy>(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}/rollback`,
        { method: 'POST' },
      );
      return {
        newDeployId: deploy.id,
        status: deploy.status,
      };
    },
  });
}
