import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-list-deployments — List recent deployments for a service.
 */
export function registerListDeploymentsTool(app: AgentApp): void {
  app.tool('railway-list-deployments', {
    description: 'List recent deployments for a service.',
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
      const deployments = await client.listDeployments(projectId, serviceId, environmentId);

      if (deployments.length === 0) {
        return 'No deployments found.';
      }

      const list = deployments
        .map(
          (d) =>
            `- **${d.id}**: ${d.status} (${d.createdAt})${d.staticUrl ? ` - ${d.staticUrl}` : ''}`,
        )
        .join('\n');

      return `Recent deployments:\n\n${list}`;
    },
  });
}
