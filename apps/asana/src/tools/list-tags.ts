import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * list-tags — GET /tags?workspace={workspaceId}.
 */
export function registerListTagsTool(app: AgentApp): void {
  app.tool('list-tags', {
    description:
      'List tags in an Asana workspace (GET /tags?workspace={workspaceId}). Returns an array of tags with gid, name, and color. Params: workspaceId (required).',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'The workspace GID (required).',
        },
      },
      required: ['workspaceId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const tags = await asanaRequest<unknown[]>(ctx, 'tags', {
        query: { workspace: String(a.workspaceId) },
      });
      return { tags };
    },
  });
}
