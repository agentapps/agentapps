import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

interface RenderEnvironment {
  id: string;
  name: string;
  projectId: string;
}

/**
 * create-environment -- POST /projects/{projectId}/environments.
 */
export function registerCreateEnvironmentTool(app: AgentApp): void {
  app.tool('create-environment', {
    description:
      'Create a new environment in a Render project. Returns { environmentId, name, projectId }. Params: projectId (required), name (required).',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Render project ID.',
        },
        name: {
          type: 'string',
          description: 'Environment name (e.g., "staging", "production").',
        },
      },
      required: ['projectId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { projectId, name } = args as { projectId: string; name: string };
      const environment = await renderRequest<RenderEnvironment>(
        ctx,
        `/projects/${encodeURIComponent(projectId)}/environments`,
        { method: 'POST', body: { name } },
      );
      return {
        environmentId: environment.id,
        name: environment.name,
        projectId: environment.projectId,
      };
    },
  });
}
