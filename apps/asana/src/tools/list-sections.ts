import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * list-sections — GET /projects/{projectId}/sections.
 */
export function registerListSectionsTool(app: AgentApp): void {
  app.tool('list-sections', {
    description:
      'List sections in an Asana project (GET /projects/{projectId}/sections). Returns an array of sections with gid and name. Params: projectId (required).',
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
      const sections = await asanaRequest<unknown[]>(ctx, `projects/${a.projectId}/sections`);
      return { sections };
    },
  });
}
