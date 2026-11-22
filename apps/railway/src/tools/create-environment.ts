import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-create-environment — Create a new environment in a Railway project.
 */
export function registerCreateEnvironmentTool(app: AgentApp): void {
  app.tool('railway-create-environment', {
    description: 'Create a new environment in a Railway project (e.g., staging, production).',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Railway project ID',
        },
        name: {
          type: 'string',
          description: 'Environment name (e.g., "staging", "production")',
        },
      },
      required: ['projectId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const projectId = a.projectId as string;
      const name = a.name as string;

      const client = await createClient(ctx);
      const environment = await client.createEnvironment(projectId, name);

      return {
        message: `Environment "${name}" created successfully`,
        environmentId: environment.id,
        name: environment.name,
      };
    },
  });
}
