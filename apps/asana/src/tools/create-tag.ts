import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * create-tag — POST /tags.
 */
export function registerCreateTagTool(app: AgentApp): void {
  app.tool('create-tag', {
    description:
      'Create a new tag in an Asana workspace (POST /tags). Returns the created tag. Params: name (required), workspaceId (required), color? (optional — e.g. "dark-pink", "dark-green", "none").',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Tag name (required).',
        },
        workspaceId: {
          type: 'string',
          description: 'The workspace GID (required).',
        },
        color: {
          type: 'string',
          description: 'Tag color (optional — e.g. "dark-pink", "dark-green", "none").',
        },
      },
      required: ['name', 'workspaceId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body: Record<string, unknown> = {
        name: a.name,
        workspace: String(a.workspaceId),
      };
      if (a.color) body.color = a.color;

      const tag = await asanaRequest(ctx, 'tags', { method: 'POST', body });
      return { tag };
    },
  });
}
