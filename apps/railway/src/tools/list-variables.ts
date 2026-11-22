import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * list-variables — List environment variables for a service.
 */
export function registerListVariablesTool(app: AgentApp): void {
  app.tool('list-variables', {
    description: 'List environment variables for a service.',
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
      },
      required: ['projectId', 'serviceId', 'environmentId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { projectId, serviceId, environmentId } = args as {
        projectId: string;
        serviceId: string;
        environmentId: string;
      };

      const client = await createClient(ctx);
      const variables = await client.listVariables(projectId, serviceId, environmentId);

      const keys = Object.keys(variables);
      if (keys.length === 0) {
        return 'No environment variables set.';
      }

      // Mask sensitive values
      const masked = keys
        .map((key) => {
          const value = variables[key];
          const display =
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('password') ||
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('key')
              ? '***'
              : value.length > 50
                ? `${value.substring(0, 50)}...`
                : value;
          return `- **${key}**: ${display}`;
        })
        .join('\n');

      return `Environment variables (${keys.length}):\n\n${masked}`;
    },
  });
}
