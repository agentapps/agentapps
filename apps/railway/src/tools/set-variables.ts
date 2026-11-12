import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-set-variables — Set environment variables for a service.
 */
export function registerSetVariablesTool(app: AgentApp): void {
  app.tool('railway-set-variables', {
    description: 'Set environment variables for a service.',
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
        variables: {
          type: 'object',
          description: 'Key-value pairs of environment variables to set',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['projectId', 'serviceId', 'environmentId', 'variables'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { projectId, serviceId, environmentId, variables } = args as {
        projectId: string;
        serviceId: string;
        environmentId: string;
        variables: Record<string, string>;
      };

      const client = await createClient(ctx);
      await client.setVariables(projectId, serviceId, environmentId, variables);

      const keys = Object.keys(variables);
      return {
        message: `Set ${keys.length} variable(s) successfully`,
        variables: keys,
      };
    },
  });
}
