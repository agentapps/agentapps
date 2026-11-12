import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * delete-project — DELETE /projects/{projectId}.
 *
 * Permanently deletes the project. IRREVERSIBLE + destructive.
 */
export function registerDeleteProjectTool(app: AgentApp): void {
  app.tool('delete-project', {
    description:
      'Delete a Todoist project permanently (DELETE /projects/{projectId}). IRREVERSIBLE — the project and all its tasks are removed. Returns { projectId, deleted }. Params: projectId (required).',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID to delete (required).',
        },
      },
      required: ['projectId'],
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
      await todoistRequest(ctx, `/projects/${a.projectId}`, { method: 'DELETE' });
      return { projectId: a.projectId, deleted: true };
    },
  });
}
