import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * list-workspaces — GET /workspaces.
 */
export function registerListWorkspacesTool(app: AgentApp): void {
  app.tool('list-workspaces', {
    description:
      'List all Asana workspaces accessible to the authenticated user (GET /workspaces). Returns an array of workspaces with gid, name, and is_organization.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const workspaces = await asanaRequest<unknown[]>(ctx, 'workspaces');
      return { workspaces };
    },
  });
}
