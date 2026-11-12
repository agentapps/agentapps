import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderEnvironment {
  id: string;
  name: string;
  projectId: string;
}

/**
 * render-list-environments -- GET /projects/{projectId}/environments.
 */
export function registerListEnvironmentsTool(app: AgentApp): void {
  app.tool('render-list-environments', {
    description:
      'List all environments in a Render project. Returns { environments: [{ id, name, projectId }] }. Params: projectId (required).',
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
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { projectId } = args as { projectId: string };
      const data = await renderRequest<{ environment: RenderEnvironment }[]>(
        ctx,
        `/projects/${encodeURIComponent(projectId)}/environments`,
        { query: { limit: 100 } },
      );
      const environments = data.map((item) => item.environment);
      return { environments };
    },
  });
}
