import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * list-labels — GET /labels.
 */
export function registerListLabelsTool(app: AgentApp): void {
  app.tool('list-labels', {
    description:
      'List all Todoist labels (GET /labels). Returns an array of labels with id, name, color, order, is_favorite.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const labels = await todoistRequest<unknown[]>(ctx, '/labels');
      return { labels };
    },
  });
}
