import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * create-project — POST /projects.
 */
export function registerCreateProjectTool(app: AgentApp): void {
  app.tool('create-project', {
    description:
      'Create a new Todoist project (POST /projects). Returns the created project. Params: name (required), parentId? (parent project ID for sub-projects), color? (berry_red, red, orange, yellow, olive_green, lime_green, green, mint_green, teal, sky_blue, light_blue, blue, grape, violet, lavender, magenta, salmon, charcoal, grey, taupe), isFavorite? (boolean).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the project (required).',
        },
        parentId: {
          type: 'string',
          description: 'Parent project ID to create a sub-project (optional).',
        },
        color: {
          type: 'string',
          description: 'Color of the project (optional).',
        },
        isFavorite: {
          type: 'boolean',
          description: 'Whether the project is a favorite (optional).',
        },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body: Record<string, unknown> = { name: a.name };
      if (a.parentId) body.parent_id = a.parentId;
      if (a.color) body.color = a.color;
      if (a.isFavorite !== undefined) body.is_favorite = a.isFavorite;

      const project = await todoistRequest(ctx, '/projects', {
        method: 'POST',
        body,
      });
      return { project };
    },
  });
}
