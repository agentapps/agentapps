import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * get-user — GET /users/me.
 */
export function registerGetUserTool(app: AgentApp): void {
  app.tool('get-user', {
    description:
      'Get the currently authenticated Asana user (GET /users/me). Returns the user with gid, name, email, and workspaces.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const user = await asanaRequest(ctx, 'users/me');
      return { user };
    },
  });
}
