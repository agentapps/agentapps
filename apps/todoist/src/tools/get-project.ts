import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * get-project — GET /projects/{projectId}.
 */
export function registerGetProjectTool(app: AgentApp): void {
  app.tool('get-project', {
    description:
      'Get a single Todoist project by ID (GET /projects/{projectId}). Returns the project with id, name, color, parent_id, order, is_favorite, etc. Params: projectId (required).',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID (required).',
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
      const a = args as Record<string, unknown>;
      const project = await todoistRequest(ctx, `/projects/${a.projectId}`);
      return { project };
    },
  });
}
