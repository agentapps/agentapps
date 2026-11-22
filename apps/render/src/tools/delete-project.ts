import type { AgentApp } from '@agentapps/sdk';
import { renderRequest } from '../lib/render-client.js';

/**
 * delete-project -- DELETE /projects/{projectId}.
 *
 * Permanently deletes the project. IRREVERSIBLE + destructive.
 */
export function registerDeleteProjectTool(app: AgentApp): void {
  app.tool('delete-project', {
    description:
      'Delete a Render project. This action is irreversible! Returns { projectId, deleted }. Params: projectId (required).',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Render project ID to delete.',
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
      const { projectId } = args as { projectId: string };
      await renderRequest(ctx, `/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      });
      return { projectId, deleted: true };
    },
  });
}
