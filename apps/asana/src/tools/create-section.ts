import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * create-section — POST /projects/{projectId}/sections.
 */
export function registerCreateSectionTool(app: AgentApp): void {
  app.tool('create-section', {
    description:
      'Create a new section in an Asana project (POST /projects/{projectId}/sections). Returns the created section. Params: projectId (required), name (required).',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project GID (required).',
        },
        name: {
          type: 'string',
          description: 'Section name (required).',
        },
      },
      required: ['projectId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const section = await asanaRequest(ctx, `projects/${a.projectId}/sections`, {
        method: 'POST',
        body: { name: a.name },
      });
      return { section };
    },
  });
}
