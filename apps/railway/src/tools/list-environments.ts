import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-list-environments — List all environments in a Railway project.
 */
export function registerListEnvironmentsTool(app: AgentApp): void {
  app.tool('railway-list-environments', {
    description: 'List all environments in a Railway project.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Railway project ID',
        },
      },
      required: ['projectId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const projectId = (args as Record<string, unknown>).projectId as string;
      const client = await createClient(ctx);
      const project = await client.getProject(projectId);

      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      if (project.environments.length === 0) {
        return `No environments found in project "${project.name}".`;
      }

      const envList = project.environments.map((e) => `- **${e.name}** (${e.id})`).join('\n');

      return `Environments in "${project.name}":\n\n${envList}`;
    },
  });
}
