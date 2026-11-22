import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

/**
 * delete-env-var -- DELETE /services/{serviceId}/env-vars/{key}.
 */
export function registerDeleteEnvVarTool(app: AgentApp): void {
  app.tool('delete-env-var', {
    description:
      'Delete an environment variable from a Render service. Returns { key, deleted }. Params: serviceId (required), key (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        key: {
          type: 'string',
          description: 'Environment variable key to delete.',
        },
      },
      required: ['serviceId', 'key'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { serviceId, key } = args as { serviceId: string; key: string };
      await renderRequest(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`,
        { method: 'DELETE' },
      );
      return { key, deleted: true };
    },
  });
}
