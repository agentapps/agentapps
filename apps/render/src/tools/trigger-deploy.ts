import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderDeploy {
  id: string;
  status: string;
  createdAt: string;
}

/**
 * render-trigger-deploy -- POST /services/{serviceId}/deploys.
 */
export function registerTriggerDeployTool(app: AgentApp): void {
  app.tool('render-trigger-deploy', {
    description:
      'Trigger a new deploy for a Render service. Returns { deployId, status, createdAt }. Params: serviceId (required), clearCache? ("clear" or "do_not_clear", default "do_not_clear").',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        clearCache: {
          type: 'string',
          description:
            'Whether to clear the build cache: "clear" or "do_not_clear" (default: do_not_clear).',
        },
      },
      required: ['serviceId'],
    },
    // A new deploy replaces the running build; render-rollback-deploy returns to the previous one.
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { serviceId, clearCache } = args as {
        serviceId: string;
        clearCache?: string;
      };
      const body: Record<string, unknown> = {};
      if (clearCache) body.clearCache = clearCache;

      const deploy = await renderRequest<RenderDeploy>(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/deploys`,
        { method: 'POST', body },
      );
      return {
        deployId: deploy.id,
        status: deploy.status,
        createdAt: deploy.createdAt,
      };
    },
  });
}
