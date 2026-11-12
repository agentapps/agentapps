import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-create-service — Create a new service in a Railway project.
 */
export function registerCreateServiceTool(app: AgentApp): void {
  app.tool('railway-create-service', {
    description: 'Create a new service in a Railway project.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Railway project ID',
        },
        name: {
          type: 'string',
          description: 'Service name (e.g., "web", "api", "worker")',
        },
      },
      required: ['projectId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const projectId = a.projectId as string;
      const name = a.name as string;

      const client = await createClient(ctx);
      const service = await client.createService(projectId, name);

      return {
        message: `Service "${name}" created successfully`,
        serviceId: service.id,
        name: service.name,
      };
    },
  });
}
