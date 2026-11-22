import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-list-services — List all services in a Railway project.
 */
export function registerListServicesTool(app: AgentApp): void {
  app.tool('railway-list-services', {
    description: 'List all services in a Railway project.',
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

      if (project.services.length === 0) {
        return `No services found in project "${project.name}".`;
      }

      const svcList = project.services.map((s) => `- **${s.name}** (${s.id})`).join('\n');

      return `Services in "${project.name}":\n\n${svcList}`;
    },
  });
}
