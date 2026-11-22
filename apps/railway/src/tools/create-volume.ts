import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-create-volume — Create a persistent volume for a service.
 */
export function registerCreateVolumeTool(app: AgentApp): void {
  app.tool('railway-create-volume', {
    description: 'Create a persistent volume for a service (useful for databases).',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Railway project ID',
        },
        serviceId: {
          type: 'string',
          description: 'The Railway service ID',
        },
        environmentId: {
          type: 'string',
          description: 'The Railway environment ID',
        },
        mountPath: {
          type: 'string',
          description: 'Path to mount the volume (e.g., "/data/db" for MongoDB)',
        },
      },
      required: ['projectId', 'serviceId', 'environmentId', 'mountPath'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { projectId, serviceId, environmentId, mountPath } = args as {
        projectId: string;
        serviceId: string;
        environmentId: string;
        mountPath: string;
      };

      const client = await createClient(ctx);
      const volume = await client.createVolume(projectId, serviceId, environmentId, mountPath);

      return {
        message: 'Volume created successfully',
        volumeId: volume.id,
        name: volume.name,
        mountPath,
      };
    },
  });
}
