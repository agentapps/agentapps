import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderUser {
  id: string;
  name: string;
  email: string;
}

/**
 * render-get-user -- GET /user.
 */
export function registerGetUserTool(app: AgentApp): void {
  app.tool('render-get-user', {
    description: 'Get the authenticated Render user info. Returns { id, name, email }.',
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
      const user = await renderRequest<RenderUser>(ctx, '/user');
      return {
        id: user.id,
        name: user.name,
        email: user.email,
      };
    },
  });
}
