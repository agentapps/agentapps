import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderDisk {
  id: string;
  name: string;
  mountPath: string;
  sizeGB: number;
}

/**
 * list-disks -- GET /services/{serviceId}/disks.
 */
export function registerListDisksTool(app: AgentApp): void {
  app.tool('list-disks', {
    description:
      'List persistent disks attached to a Render service. Returns { disks: [{ id, name, mountPath, sizeGB }] }. Params: serviceId (required).',
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
      const data = await renderRequest<{ disk: RenderDisk }[]>(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/disks`,
        { query: { limit: 100 } },
      );
      const disks = data.map((item) => ({
        id: item.disk.id,
        name: item.disk.name,
        mountPath: item.disk.mountPath,
        sizeGB: item.disk.sizeGB,
      }));
      return { disks };
    },
  });
}
