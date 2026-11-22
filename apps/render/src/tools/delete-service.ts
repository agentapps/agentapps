import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

/**
 * delete-service -- DELETE /services/{serviceId}.
 *
 * Permanently deletes the service. IRREVERSIBLE + destructive.
 */
export function registerDeleteServiceTool(app: AgentApp): void {
  app.tool('delete-service', {
    description:
      'Delete a Render service. This action is irreversible! Returns { serviceId, deleted }. Params: serviceId (required).',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Render service ID to delete.',
        },
      },
      required: ['serviceId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { serviceId } = args as { serviceId: string };
      await renderRequest(ctx, `/services/${encodeURIComponent(serviceId)}`, {
        method: 'DELETE',
      });
      return { serviceId, deleted: true };
    },
  });
}
