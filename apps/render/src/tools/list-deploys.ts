import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderDeploy {
  id: string;
  status: string;
  createdAt: string;
  commit?: {
    id: string;
    message: string;
    createdAt: string;
  };
}

/**
 * render-list-deploys -- GET /services/{serviceId}/deploys.
 */
export function registerListDeploysTool(app: AgentApp): void {
  app.tool('render-list-deploys', {
    description:
      'List recent deploys for a Render service. Returns { deploys: [{ id, status, createdAt, commit? }] }. Params: serviceId (required), limit? (1-100, default 10).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of deploys to return (default: 10, max: 100).',
          default: 10,
        },
      },
      required: ['serviceId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as { serviceId: string; limit?: number };
      const limit = Math.min(Math.max(1, a.limit ?? 10), 100);
      const data = await renderRequest<{ deploy: RenderDeploy }[]>(
        ctx,
        `/services/${encodeURIComponent(a.serviceId)}/deploys`,
        { query: { limit } },
      );
      const deploys = data.map((item) => ({
        id: item.deploy.id,
        status: item.deploy.status,
        createdAt: item.deploy.createdAt,
        commit: item.deploy.commit ?? null,
      }));
      return { deploys };
    },
  });
}
