import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * create-section — POST /sections.
 */
export function registerCreateSectionTool(app: AgentApp): void {
  app.tool('create-section', {
    description:
      'Create a new section in a Todoist project (POST /sections). Returns the created section. Params: name (required), projectId (required), order? (section order).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the section (required).',
        },
        projectId: {
          type: 'string',
          description: 'Project ID where the section will be created (required).',
        },
        order: {
          type: 'number',
          description: 'Order of the section (optional).',
        },
      },
      required: ['name', 'projectId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body: Record<string, unknown> = {
        name: a.name,
        project_id: a.projectId,
      };
      if (a.order !== undefined) body.order = a.order;

      const section = await todoistRequest(ctx, '/sections', { method: 'POST', body });
      return { section };
    },
  });
}
