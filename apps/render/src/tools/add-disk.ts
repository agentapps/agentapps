import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderDisk {
  id: string;
  name: string;
  mountPath: string;
  sizeGB: number;
}

/**
 * add-disk -- POST /services/{serviceId}/disks.
 */
export function registerAddDiskTool(app: AgentApp): void {
  app.tool('add-disk', {
    description:
      'Add a persistent disk to a Render service (useful for databases and stateful apps). Returns { diskId, name, mountPath, sizeGB }. Params: serviceId (required), name (required), mountPath (required -- e.g., "/data"), sizeGB (required -- minimum 1).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        name: {
          type: 'string',
          description: 'Disk name.',
        },
        mountPath: {
          type: 'string',
          description: 'Mount path inside the container (e.g., "/data").',
        },
        sizeGB: {
          type: 'number',
          description: 'Disk size in GB (minimum: 1).',
        },
      },
      required: ['serviceId', 'name', 'mountPath', 'sizeGB'],
    },
    // A persistent disk is billed per GB from the moment it exists: it starts real spend.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { serviceId, name, mountPath, sizeGB } = args as {
        serviceId: string;
        name: string;
        mountPath: string;
        sizeGB: number;
      };
      const disk = await renderRequest<RenderDisk>(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/disks`,
        { method: 'POST', body: { name, mountPath, sizeGB } },
      );
      return {
        diskId: disk.id,
        name: disk.name,
        mountPath: disk.mountPath,
        sizeGB: disk.sizeGB,
      };
    },
  });
}
