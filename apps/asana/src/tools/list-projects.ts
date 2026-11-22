import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * list-projects — GET /projects?workspace={workspaceId}.
 */
export function registerListProjectsTool(app: AgentApp): void {
  app.tool('list-projects', {
    description:
      'List projects in an Asana workspace (GET /projects?workspace={workspaceId}). Returns an array of projects with gid, name, and resource_type. Params: workspaceId (required).',
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
      const projects = await asanaRequest<unknown[]>(ctx, 'projects', {
        query: { workspace: String(a.workspaceId) },
      });
      return { projects };
    },
  });
}
