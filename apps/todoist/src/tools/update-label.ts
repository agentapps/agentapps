import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * update-label — POST /labels/{labelId}.
 */
export function registerUpdateLabelTool(app: AgentApp): void {
  app.tool('update-label', {
    description:
      'Update an existing Todoist label (POST /labels/{labelId}). Returns the updated label. Params: labelId (required), name? (new name), color? (new color), isFavorite? (boolean).',
    parameters: {
      type: 'object',
      properties: {
        labelId: {
          type: 'string',
          description: 'The label ID to update (required).',
        },
        name: {
          type: 'string',
          description: 'New name for the label (optional).',
        },
        color: {
          type: 'string',
          description: 'New color for the label (optional).',
        },
        isFavorite: {
          type: 'boolean',
          description: 'Whether the label is a favorite (optional).',
        },
      },
      required: ['labelId'],
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

      const label = await todoistRequest(ctx, `/labels/${a.labelId}`, { method: 'POST', body });
      return { label };
    },
  });
}
