import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-get-project — Get detailed information about a Railway project.
 */
export function registerGetProjectTool(app: AgentApp): void {
  app.tool('railway-get-project', {
    description:
      'Get detailed information about a Railway project including services and environments.',
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

      let result = `# Project: ${project.name}\n\n`;
      result += `- **ID**: ${project.id}\n`;
      result += `- **Description**: ${project.description || 'None'}\n`;
      result += `- **Created**: ${project.createdAt}\n\n`;

      result += `## Environments\n`;
      if (project.environments.length === 0) {
        result += 'No environments.\n';
      } else {
        for (const env of project.environments) {
          result += `- **${env.name}** (${env.id})\n`;
        }
      }

      result += `\n## Services\n`;
      if (project.services.length === 0) {
        result += 'No services.\n';
      } else {
        for (const svc of project.services) {
          result += `- **${svc.name}** (${svc.id})\n`;
        }
      }

      return result;
    },
  });
}
