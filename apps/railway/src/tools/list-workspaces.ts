import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * list-workspaces — List all Railway workspaces available to the current user.
 */
export function registerListWorkspacesTool(app: AgentApp): void {
  app.tool('list-workspaces', {
    description: 'List all Railway workspaces available to the current user.',
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
      const client = await createClient(ctx);
      const workspaces = await client.listWorkspaces();

      if (workspaces.length === 0) {
        return 'No workspaces found.';
      }

      const list = workspaces.map((ws) => `- **${ws.name}** (${ws.id})`).join('\n');

      return `Available workspaces:\n\n${list}`;
    },
  });
}
