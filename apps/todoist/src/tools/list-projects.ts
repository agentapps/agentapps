import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * list-projects — GET /projects.
 */
export function registerListProjectsTool(app: AgentApp): void {
  app.tool('list-projects', {
    description:
      'List all Todoist projects (GET /projects). Returns an array of projects with id, name, color, parent_id, order, is_favorite, etc.',
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
      const projects = await todoistRequest<unknown[]>(ctx, '/projects');
      return { projects };
    },
  });
}
