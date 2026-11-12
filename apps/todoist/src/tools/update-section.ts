import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * update-section — POST /sections/{sectionId}.
 */
export function registerUpdateSectionTool(app: AgentApp): void {
  app.tool('update-section', {
    description:
      'Update a Todoist section name (POST /sections/{sectionId}). Returns the updated section. Params: sectionId (required), name (required — new name).',
    parameters: {
      type: 'object',
      properties: {
        sectionId: {
          type: 'string',
          description: 'The section ID to update (required).',
        },
        name: {
          type: 'string',
          description: 'New name for the section (required).',
        },
      },
      required: ['sectionId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body = { name: a.name };

      const section = await todoistRequest(ctx, `/sections/${a.sectionId}`, {
        method: 'POST',
        body,
      });
      return { section };
    },
  });
}
