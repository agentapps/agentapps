import type { AgentApp } from '@agentapps/sdk';
import { createClient, formatProject } from './_helpers.js';

/**
 * railway-list-projects — List all Railway projects in the connected account.
 */
export function registerListProjectsTool(app: AgentApp): void {
  app.tool('railway-list-projects', {
    description: 'List all Railway projects in the connected account.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const client = await createClient(ctx);
      const projects = await client.listProjects();

      if (projects.length === 0) {
        return 'No projects found. Use railway-create-project to create one.';
      }

      const formatted = projects.map(formatProject).join('\n\n');
      return `Found ${projects.length} project(s):\n\n${formatted}`;
    },
  });
}
