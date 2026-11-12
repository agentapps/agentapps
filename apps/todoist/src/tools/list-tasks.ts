import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * list-tasks — GET /tasks.
 */
export function registerListTasksTool(app: AgentApp): void {
  app.tool('list-tasks', {
    description:
      "List active Todoist tasks (GET /tasks). Optionally filter by project or filter expression. Returns an array of tasks. Params: projectId? (filter by project ID), filter? (filter expression, e.g. 'today', 'overdue', 'p1').",
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Filter tasks by project ID (optional).',
        },
        filter: {
          type: 'string',
          description: "Filter expression (optional, e.g. 'today', 'overdue', 'p1').",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const query: Record<string, string | undefined> = {};
      if (a.projectId) query.project_id = String(a.projectId);
      if (a.filter) query.filter = String(a.filter);

      const tasks = await todoistRequest<unknown[]>(ctx, '/tasks', { query });
      return { tasks };
    },
  });
}
