import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * delete-section — DELETE /sections/{sectionId}.
 *
 * Permanently deletes the section. IRREVERSIBLE + destructive.
 */
export function registerDeleteSectionTool(app: AgentApp): void {
  app.tool('delete-section', {
    description:
      'Delete a Todoist section permanently (DELETE /sections/{sectionId}). IRREVERSIBLE — the section and its tasks are removed. Returns { sectionId, deleted }. Params: sectionId (required).',
    parameters: {
      type: 'object',
      properties: {
        sectionId: {
          type: 'string',
          description: 'The section ID to delete (required).',
        },
      },
      required: ['sectionId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      await todoistRequest(ctx, `/sections/${a.sectionId}`, { method: 'DELETE' });
      return { sectionId: a.sectionId, deleted: true };
    },
  });
}
