import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * delete-label — DELETE /labels/{labelId}.
 *
 * Permanently deletes the label. IRREVERSIBLE + destructive.
 */
export function registerDeleteLabelTool(app: AgentApp): void {
  app.tool('delete-label', {
    description:
      'Delete a Todoist label permanently (DELETE /labels/{labelId}). IRREVERSIBLE — the label is removed. Returns { labelId, deleted }. Params: labelId (required).',
    parameters: {
      type: 'object',
      properties: {
        labelId: {
          type: 'string',
          description: 'The label ID to delete (required).',
        },
      },
      required: ['labelId'],
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
      await todoistRequest(ctx, `/labels/${a.labelId}`, { method: 'DELETE' });
      return { labelId: a.labelId, deleted: true };
    },
  });
}
