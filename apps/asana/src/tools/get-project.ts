import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * get-project — GET /projects/{projectId}.
 */
export function registerGetProjectTool(app: AgentApp): void {
  app.tool('get-project', {
    description:
      'Get a single Asana project by GID (GET /projects/{projectId}). Returns the project with gid, name, notes, owner, workspace, etc. Params: projectId (required).',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project GID (required).',
        },
      },
      required: ['projectId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const project = await asanaRequest(ctx, `projects/${a.projectId}`);
      return { project };
    },
  });
}
