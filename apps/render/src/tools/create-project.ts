import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderProject {
  id: string;
  name: string;
  ownerId: string;
}

/**
 * render-create-project -- POST /projects.
 */
export function registerCreateProjectTool(app: AgentApp): void {
  app.tool('render-create-project', {
    description:
      'Create a new project in Render. Use render-list-owners to get the ownerId. Returns { projectId, name, ownerId }. Params: name (required), ownerId (required).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Project name.',
        },
        ownerId: {
          type: 'string',
          description: 'Owner/workspace ID (use render-list-owners to get IDs).',
        },
      },
      required: ['name', 'ownerId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { name, ownerId } = args as { name: string; ownerId: string };
      const project = await renderRequest<RenderProject>(ctx, '/projects', {
        method: 'POST',
        body: { name, ownerId },
      });
      return {
        projectId: project.id,
        name: project.name,
        ownerId: project.ownerId,
      };
    },
  });
}
