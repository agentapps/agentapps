import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * create-domain — Create a Railway-generated domain for a service.
 */
export function registerCreateDomainTool(app: AgentApp): void {
  app.tool('create-domain', {
    description: 'Create a Railway-generated domain for a service (e.g., myapp.up.railway.app).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Railway service ID',
        },
        environmentId: {
          type: 'string',
          description: 'The Railway environment ID',
        },
      },
      required: ['serviceId', 'environmentId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { serviceId, environmentId } = args as {
        serviceId: string;
        environmentId: string;
      };

      const client = await createClient(ctx);
      const domain = await client.createServiceDomain(serviceId, environmentId);

      return {
        message: 'Domain created successfully',
        domain: domain.domain,
        url: `https://${domain.domain}`,
      };
    },
  });
}
