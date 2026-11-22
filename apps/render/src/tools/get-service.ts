import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderService {
  id: string;
  name: string;
  type: string;
  ownerId: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  serviceDetails?: {
    url?: string;
    buildCommand?: string;
    startCommand?: string;
    region?: string;
    plan?: string;
    branch?: string;
    repoURL?: string;
    autoDeploy?: string;
  };
}

/**
 * get-service -- GET /services/{serviceId}.
 */
export function registerGetServiceTool(app: AgentApp): void {
  app.tool('get-service', {
    description:
      'Get detailed information about a specific Render service. Returns { id, name, type, status, slug, ownerId, createdAt, updatedAt, serviceDetails? }. Params: serviceId (required).',
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
      const svc = await renderRequest<RenderService>(
        ctx,
        `/services/${encodeURIComponent(serviceId)}`,
      );
      return {
        id: svc.id,
        name: svc.name,
        type: svc.type,
        status: svc.status,
        slug: svc.slug,
        ownerId: svc.ownerId,
        createdAt: svc.createdAt,
        updatedAt: svc.updatedAt,
        serviceDetails: svc.serviceDetails ?? null,
      };
    },
  });
}
