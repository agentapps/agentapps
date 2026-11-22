import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

/**
 * suspend-service -- POST /services/{serviceId}/suspend.
 */
export function registerSuspendServiceTool(app: AgentApp): void {
  app.tool('suspend-service', {
    description:
      'Suspend a running Render service (stops billing for compute). Returns { serviceId, suspended }. Params: serviceId (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID to suspend.',
        },
      },
      required: ['serviceId'],
    },
    // Takes the service offline, but resume-service brings it back.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { serviceId } = args as { serviceId: string };
      await renderRequest(ctx, `/services/${encodeURIComponent(serviceId)}/suspend`, {
        method: 'POST',
      });
      return { serviceId, suspended: true };
    },
  });
}
