import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderDeploy {
  id: string;
  status: string;
}

/**
 * render-rollback-deploy -- POST /services/{serviceId}/deploys/{deployId}/rollback.
 */
export function registerRollbackDeployTool(app: AgentApp): void {
  app.tool('render-rollback-deploy', {
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
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
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
