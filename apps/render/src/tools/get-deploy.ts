import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderDeploy {
  id: string;
  serviceId: string;
  status: string;
  trigger: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  commit?: {
    id: string;
    message: string;
    createdAt: string;
  };
}

/**
 * render-get-deploy -- GET /services/{serviceId}/deploys/{deployId}.
 */
export function registerGetDeployTool(app: AgentApp): void {
  app.tool('render-get-deploy', {
    description:
      'Get the status and details of a specific Render deploy. Returns { id, serviceId, status, trigger, createdAt, updatedAt, finishedAt?, commit? }. Params: serviceId (required), deployId (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        deployId: {
          type: 'string',
          description: 'The Render deploy ID.',
        },
      },
      required: ['serviceId', 'deployId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { serviceId, deployId } = args as { serviceId: string; deployId: string };
      const deploy = await renderRequest<RenderDeploy>(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`,
      );
      return {
        id: deploy.id,
        serviceId: deploy.serviceId,
        status: deploy.status,
        trigger: deploy.trigger,
        createdAt: deploy.createdAt,
        updatedAt: deploy.updatedAt,
        finishedAt: deploy.finishedAt ?? null,
        commit: deploy.commit ?? null,
      };
    },
  });
}
