import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

/**
 * render-resume-service -- POST /services/{serviceId}/resume.
 */
export function registerResumeServiceTool(app: AgentApp): void {
  app.tool('render-resume-service', {
    description:
      'Resume a suspended Render service. Returns { serviceId, resumed }. Params: serviceId (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID to resume.',
        },
      },
      required: ['serviceId'],
    },
    // Reversible with render-suspend-service; it restores a service that already existed.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { serviceId } = args as { serviceId: string };
      await renderRequest(ctx, `/services/${encodeURIComponent(serviceId)}/resume`, {
        method: 'POST',
      });
      return { serviceId, resumed: true };
    },
  });
}
