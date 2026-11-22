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
 * render-get-project -- GET /projects/{projectId}.
 */
export function registerGetProjectTool(app: AgentApp): void {
  app.tool('render-get-project', {
    description:
      'Get detailed information about a specific Render project. Returns { id, name, ownerId, createdAt, updatedAt }. Params: projectId (required).',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Render project ID.',
        },
      },
      required: ['projectId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { projectId } = args as { projectId: string };
      const project = await renderRequest<RenderProject>(
        ctx,
        `/projects/${encodeURIComponent(projectId)}`,
      );
      return {
        id: project.id,
        name: project.name,
        ownerId: project.ownerId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };
    },
  });
}
