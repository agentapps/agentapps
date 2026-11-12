import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderEnvVar {
  key: string;
  value: string;
}

/**
 * render-list-env-vars -- GET /services/{serviceId}/env-vars.
 *
 * Sensitive values (containing secret/password/token/key/api in the key name)
 * are masked in the response to avoid leaking credentials.
 */
export function registerListEnvVarsTool(app: AgentApp): void {
  app.tool('render-list-env-vars', {
    description:
      'List environment variables for a Render service. Sensitive values are masked. Returns { envVars: [{ key, value }], count }. Params: serviceId (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID.',
        },
      },
      required: ['serviceId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { serviceId } = args as { serviceId: string };
      const data = await renderRequest<{ envVar: RenderEnvVar }[]>(
        ctx,
        `/services/${encodeURIComponent(serviceId)}/env-vars`,
        { query: { limit: 100 } },
      );
      const envVars = data.map((item) => {
        const { key, value } = item.envVar;
        const lower = key.toLowerCase();
        const isSensitive =
          lower.includes('secret') ||
          lower.includes('password') ||
          lower.includes('token') ||
          lower.includes('key') ||
          lower.includes('api');
        return {
          key,
          value: isSensitive ? '***' : value.length > 50 ? `${value.substring(0, 50)}...` : value,
        };
      });
      return { envVars, count: envVars.length };
    },
  });
}
