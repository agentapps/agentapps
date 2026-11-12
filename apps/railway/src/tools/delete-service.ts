import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-delete-service — Delete a service from a Railway project.
 */
export function registerDeleteServiceTool(app: AgentApp): void {
  app.tool('railway-delete-service', {
    description: 'Delete a service from a Railway project.',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Railway service ID to delete',
        },
      },
      required: ['serviceId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const serviceId = (args as Record<string, unknown>).serviceId as string;
      const client = await createClient(ctx);

      await client.deleteService(serviceId);

      return {
        message: `Service ${serviceId} deleted successfully`,
        deleted: true,
      };
    },
  });
}
