import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-list-domains — List domains for a service.
 */
export function registerListDomainsTool(app: AgentApp): void {
  app.tool('railway-list-domains', {
    description: 'List domains for a service.',
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
      const domains = await client.listDomains(projectId, serviceId, environmentId);

      if (domains.length === 0) {
        return 'No domains configured. Use railway-create-domain to create one.';
      }

      const list = domains.map((d) => `- **${d.domain}** (${d.id})`).join('\n');

      return `Domains:\n\n${list}`;
    },
  });
}
