import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * get-section — GET /sections/{sectionId}.
 */
export function registerGetSectionTool(app: AgentApp): void {
  app.tool('get-section', {
    description:
      'Get a single Todoist section by ID (GET /sections/{sectionId}). Returns the section with id, project_id, order, name. Params: sectionId (required).',
    parameters: {
      type: 'object',
      properties: {
        sectionId: {
          type: 'string',
          description: 'The section ID (required).',
        },
      },
      required: ['sectionId'],
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
      const section = await todoistRequest(ctx, `/sections/${a.sectionId}`);
      return { section };
    },
  });
}
