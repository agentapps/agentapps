import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderEnvironment {
  id: string;
  name: string;
  projectId: string;
}

/**
 * list-environments -- GET /projects/{projectId}/environments.
 */
export function registerListEnvironmentsTool(app: AgentApp): void {
  app.tool('list-environments', {
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
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
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
