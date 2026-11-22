import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * update-project — POST /projects/{projectId}.
 */
export function registerUpdateProjectTool(app: AgentApp): void {
  app.tool('update-project', {
    description:
      'Update an existing Todoist project (POST /projects/{projectId}). Returns the updated project. Params: projectId (required), name? (new name), color? (new color), isFavorite? (boolean).',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID to update (required).',
        },
        name: {
          type: 'string',
          description: 'New name for the project (optional).',
        },
        color: {
          type: 'string',
          description: 'New color for the project (optional).',
        },
        isFavorite: {
          type: 'boolean',
          description: 'Whether the project is a favorite (optional).',
        },
      },
      required: ['projectId'],
    },
    // Setting the fields again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body: Record<string, unknown> = {};
      if (a.name) body.name = a.name;
      if (a.color) body.color = a.color;
      if (a.isFavorite !== undefined) body.is_favorite = a.isFavorite;

      const project = await todoistRequest(ctx, `/projects/${a.projectId}`, {
        method: 'POST',
        body,
      });
      return { project };
    },
  });
}
