import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderCustomDomain {
  id: string;
  name: string;
  verificationStatus: string;
}

/**
 * list-custom-domains -- GET /services/{serviceId}/custom-domains.
 */
export function registerListCustomDomainsTool(app: AgentApp): void {
  app.tool('list-custom-domains', {
    description:
      'List custom domains configured for a Render service. Returns { domains: [{ id, name, verificationStatus }] }. Params: serviceId (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
      },
      required: ['serviceId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { serviceId } = args as { serviceId: string };
      const data = await renderRequest<{ customDomain: RenderCustomDomain }[]>(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/custom-domains`,
        { query: { limit: 100 } },
      );
      const domains = data.map((item) => ({
        id: item.customDomain.id,
        name: item.customDomain.name,
        verificationStatus: item.customDomain.verificationStatus,
      }));
      return { domains };
    },
  });
}
