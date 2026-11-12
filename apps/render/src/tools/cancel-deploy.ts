import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

/**
 * render-cancel-deploy -- POST /services/{serviceId}/deploys/{deployId}/cancel.
 */
export function registerCancelDeployTool(app: AgentApp): void {
  app.tool('render-cancel-deploy', {
    description:
      'Cancel a running Render deploy. Returns { deployId, cancelled }. Params: serviceId (required), deployId (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        deployId: {
          type: 'string',
          description: 'The Render deploy ID to cancel.',
        },
      },
      required: ['serviceId', 'deployId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { serviceId, deployId } = args as { serviceId: string; deployId: string };
      await renderRequest(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}/cancel`,
        { method: 'POST' },
      );
      return { deployId, cancelled: true };
    },
  });
}
