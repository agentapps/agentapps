import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderOwner {
  id: string;
  name: string;
  email: string;
  type: 'user' | 'team';
}

/**
 * render-list-owners -- GET /owners.
 */
export function registerListOwnersTool(app: AgentApp): void {
  app.tool('render-list-owners', {
    description:
      'List all workspaces/owners (personal and team accounts) accessible to the authenticated user. Returns { owners: [{ id, name, email, type }] }.',
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
      const data = await renderRequest<{ owner: RenderOwner }[]>(ctx, '/owners', {
        query: { limit: 100 },
      });
      const owners = data.map((item) => item.owner);
      return { owners };
    },
  });
}
