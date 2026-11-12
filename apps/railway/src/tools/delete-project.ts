import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-delete-project — Delete a Railway project. Irreversible!
 */
export function registerDeleteProjectTool(app: AgentApp): void {
  app.tool('railway-delete-project', {
    description: 'Delete a Railway project. This action is irreversible!',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Railway project ID to delete',
        },
      },
      required: ['projectId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const projectId = (args as Record<string, unknown>).projectId as string;
      const client = await createClient(ctx);

      // Get project name for confirmation
      const project = await client.getProject(projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      await client.deleteProject(projectId);

      return {
        message: `Project "${project.name}" (${projectId}) deleted successfully`,
        deleted: true,
      };
    },
  });
}
