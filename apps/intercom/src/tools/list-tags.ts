import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest } from '../lib/intercom-client.js';

/**
 * list-tags — GET /tags.
 */
export function registerListTagsTool(app: AgentApp): void {
  app.tool('list-tags', {
    description:
      'List all tags defined in the Intercom workspace. Useful for finding tag IDs before tagging conversations.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const result = await intercomRequest<Record<string, unknown>>(ctx, '/tags');
      const tags = (result.data as Array<Record<string, unknown>>) ?? [];
      return {
        count: tags.length,
        tags: tags.map((t) => ({ id: t.id, name: t.name })),
      };
    },
  });
}
