import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * create-label — POST /labels.
 */
export function registerCreateLabelTool(app: AgentApp): void {
  app.tool('create-label', {
    description:
      'Create a new Todoist label (POST /labels). Returns the created label. Params: name (required), color? (label color), isFavorite? (boolean).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the label (required).',
        },
        color: {
          type: 'string',
          description: 'Color of the label (optional).',
        },
        isFavorite: {
          type: 'boolean',
          description: 'Whether the label is a favorite (optional).',
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
      if (a.color) body.color = a.color;
      if (a.isFavorite !== undefined) body.is_favorite = a.isFavorite;

      const label = await todoistRequest(ctx, '/labels', { method: 'POST', body });
      return { label };
    },
  });
}
