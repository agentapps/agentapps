import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

/**
 * render-restart-service -- POST /services/{serviceId}/restart.
 */
export function registerRestartServiceTool(app: AgentApp): void {
  app.tool('render-restart-service', {
    description:
      'Restart a running Render service. Returns { serviceId, restarted }. Params: serviceId (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID to restart.',
        },
      },
      required: ['serviceId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { serviceId } = args as { serviceId: string };
      await renderRequest(ctx, `/services/${encodeURIComponent(serviceId)}/restart`, {
        method: 'POST',
      });
      return { serviceId, restarted: true };
    },
  });
}
