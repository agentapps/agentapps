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
    region?: string;
  };
}

/**
 * render-list-services -- GET /services.
 */
export function registerListServicesTool(app: AgentApp): void {
  app.tool('render-list-services', {
    description:
      'List all services in the Render account. Optionally filter by type or name. Returns { services: [{ id, name, type, status, url?, region? }], count }. Params: type? (web_service, static_site, background_worker, private_service, cron_job), name? (partial match).',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description:
            'Filter by service type: web_service, static_site, background_worker, private_service, cron_job.',
        },
        name: {
          type: 'string',
          description: 'Filter by service name (partial match).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const query: Record<string, string | number | undefined> = { limit: 100 };
      if (typeof a.type === 'string' && a.type.trim()) query.type = a.type.trim();
      if (typeof a.name === 'string' && a.name.trim()) query.name = a.name.trim();

      const data = await renderRequest<{ service: RenderService }[]>(ctx, '/services', { query });
      const services = data.map((item) => ({
        id: item.service.id,
        name: item.service.name,
        type: item.service.type,
        status: item.service.status,
        url: item.service.serviceDetails?.url ?? null,
        region: item.service.serviceDetails?.region ?? null,
        createdAt: item.service.createdAt,
      }));
      return { services, count: services.length };
    },
  });
}
