import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

/**
 * render-update-env-var -- PUT /services/{serviceId}/env-vars/{key}.
 */
export function registerUpdateEnvVarTool(app: AgentApp): void {
  app.tool('render-update-env-var', {
    description:
      'Add or update a single environment variable for a Render service. Returns { key, updated }. Params: serviceId (required), key (required), value (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        key: {
          type: 'string',
          description: 'Environment variable key.',
        },
        value: {
          type: 'string',
          description: 'Environment variable value.',
        },
      },
      required: ['serviceId', 'key', 'value'],
    },
    // Overwrites the current value, which the app cannot read back in full (list-env-vars masks
    // and truncates), so it cannot restore it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { serviceId, key, value } = args as { serviceId: string; key: string; value: string };
      await renderRequest(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`,
        { method: 'PUT', body: { value } },
      );
      return { key, updated: true };
    },
  });
}
