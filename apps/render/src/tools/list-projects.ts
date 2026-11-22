import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderProject {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * render-list-projects -- GET /projects.
 */
export function registerListProjectsTool(app: AgentApp): void {
  app.tool('render-list-projects', {
    description:
      'List all projects in the Render account. Returns { projects: [{ id, name, ownerId, createdAt, updatedAt }] }.',
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
      const data = await renderRequest<{ project: RenderProject }[]>(ctx, '/projects', {
        query: { limit: 100 },
      });
      const projects = data.map((item) => item.project);
      return { projects };
    },
  });
}
