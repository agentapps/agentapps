import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderCustomDomain {
  id: string;
  name: string;
  verificationStatus: string;
}

/**
 * render-add-custom-domain -- POST /services/{serviceId}/custom-domains.
 */
export function registerAddCustomDomainTool(app: AgentApp): void {
  app.tool('render-add-custom-domain', {
    description:
      'Add a custom domain to a Render service. Returns { domainId, name, verificationStatus }. Params: serviceId (required), domain (required -- e.g., "app.example.com").',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        domain: {
          type: 'string',
          description: 'The custom domain name (e.g., "app.example.com").',
        },
      },
      required: ['serviceId', 'domain'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { serviceId, domain } = args as { serviceId: string; domain: string };
      const result = await renderRequest<RenderCustomDomain>(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/custom-domains`,
        { method: 'POST', body: { name: domain } },
      );
      return {
        domainId: result.id,
        name: result.name,
        verificationStatus: result.verificationStatus,
      };
    },
  });
}
