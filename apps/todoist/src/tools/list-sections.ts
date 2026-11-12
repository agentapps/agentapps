import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * list-sections — GET /sections.
 */
export function registerListSectionsTool(app: AgentApp): void {
  app.tool('list-sections', {
    description:
      'List sections in a Todoist project (GET /sections). Returns an array of sections. Params: projectId? (project ID — returns all sections if not specified).',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to get sections for (optional, returns all if not specified).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const query: Record<string, string | undefined> = {};
      if (a.projectId) query.project_id = String(a.projectId);

      const sections = await todoistRequest<unknown[]>(ctx, '/sections', { query });
      return { sections };
    },
  });
}
