import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * list-tasks — GET /tasks?project={projectId}.
 */
export function registerListTasksTool(app: AgentApp): void {
  app.tool('list-tasks', {
    description:
      'List tasks in an Asana project (GET /tasks?project={projectId}). Returns an array of tasks with gid, name, and resource_type. Params: projectId (required).',
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
      const tasks = await asanaRequest<unknown[]>(ctx, 'tasks', {
        query: { project: String(a.projectId) },
      });
      return { tasks };
    },
  });
}
