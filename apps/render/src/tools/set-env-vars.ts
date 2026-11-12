import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

/**
 * render-set-env-vars -- PUT /services/{serviceId}/env-vars.
 *
 * Replaces ALL environment variables for a service.
 */
export function registerSetEnvVarsTool(app: AgentApp): void {
  app.tool('render-set-env-vars', {
    description:
      'Set (replace all) environment variables for a Render service. This replaces ALL existing variables. Use render-update-env-var to update a single variable. Returns { keys, count }. Params: serviceId (required), envVars (required -- array of { key, value }).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
        envVars: {
          type: 'array',
          description: 'Array of environment variables to set.',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['key', 'value'],
          },
        },
      },
      required: ['serviceId', 'envVars'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { serviceId, envVars } = args as {
        serviceId: string;
        envVars: { key: string; value: string }[];
      };
      await renderRequest(ctx, `/services/${encodeURIComponent(serviceId)}/env-vars`, {
        method: 'PUT',
        body: envVars,
      });
      return {
        keys: envVars.map((e) => e.key),
        count: envVars.length,
      };
    },
  });
}
