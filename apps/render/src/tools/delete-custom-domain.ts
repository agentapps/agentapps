import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

/**
 * render-delete-custom-domain -- DELETE /services/{serviceId}/custom-domains/{domainId}.
 */
export function registerDeleteCustomDomainTool(app: AgentApp): void {
  app.tool('render-delete-custom-domain', {
    description:
      'Remove a custom domain from a Render service. Returns { domainId, deleted }. Params: serviceId (required), domainId (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        domainId: {
          type: 'string',
          description: 'The custom domain ID to remove.',
        },
      },
      required: ['serviceId', 'domainId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { serviceId, domainId } = args as { serviceId: string; domainId: string };
      await renderRequest(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/custom-domains/${encodeURIComponent(domainId)}`,
        { method: 'DELETE' },
      );
      return { domainId, deleted: true };
    },
  });
}
