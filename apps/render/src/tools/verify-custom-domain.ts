import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderCustomDomain {
  id: string;
  name: string;
  verificationStatus: string;
}

/**
 * render-verify-custom-domain -- POST /services/{serviceId}/custom-domains/{domainId}/verify.
 */
export function registerVerifyCustomDomainTool(app: AgentApp): void {
  app.tool('render-verify-custom-domain', {
    description:
      'Verify DNS configuration for a custom domain on a Render service. Returns { domainId, name, verificationStatus }. Params: serviceId (required), domainId (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        domainId: {
          type: 'string',
          description: 'The custom domain ID to verify.',
        },
      },
      required: ['serviceId', 'domainId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { serviceId, domainId } = args as { serviceId: string; domainId: string };
      const result = await renderRequest<RenderCustomDomain>(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/custom-domains/${encodeURIComponent(domainId)}/verify`,
        { method: 'POST' },
      );
      return {
        domainId: result.id,
        name: result.name,
        verificationStatus: result.verificationStatus,
      };
    },
  });
}
