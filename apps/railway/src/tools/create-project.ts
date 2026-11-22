import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-create-project — Create a new Railway project.
 */
export function registerCreateProjectTool(app: AgentApp): void {
  app.tool('railway-create-project', {
    description:
      'Create a new Railway project. Requires a workspaceId - use railway-list-workspaces to get available workspaces.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Project name',
        },
        workspaceId: {
          type: 'string',
          description:
            'Workspace ID to create the project in (use railway-list-workspaces to get IDs)',
        },
        description: {
          type: 'string',
          description: 'Optional project description',
        },
      },
      required: ['name', 'workspaceId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const name = a.name as string;
      const workspaceId = a.workspaceId as string;
      const description = a.description as string | undefined;

      const client = await createClient(ctx);
      const project = await client.createProject(name, workspaceId, description);

      return {
        message: `Project "${name}" created successfully`,
        projectId: project.id,
        name: project.name,
        workspaceId,
        environments: project.environments.map((e) => ({
          id: e.id,
          name: e.name,
        })),
      };
    },
  });
}
