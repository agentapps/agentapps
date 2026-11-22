import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * search-tasks — GET /workspaces/{workspaceId}/tasks/search.
 */
export function registerSearchTasksTool(app: AgentApp): void {
  app.tool('search-tasks', {
    description:
      'Search tasks in an Asana workspace (GET /workspaces/{workspaceId}/tasks/search). Returns matching tasks. Params: workspaceId (required), text? (search string), completed? (boolean), assignee? (user GID or "me"), projectId? (filter by project GID), sectionId? (filter by section GID), isSubtask? (boolean).',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'The workspace GID (required).',
        },
        text: {
          type: 'string',
          description: 'Search text to match against task names and descriptions (optional).',
        },
        completed: {
          type: 'boolean',
          description: 'Filter by completion status (optional).',
        },
        assignee: {
          type: 'string',
          description: 'Filter by assignee — user GID or "me" (optional).',
        },
        projectId: {
          type: 'string',
          description: 'Filter by project GID (optional).',
        },
        sectionId: {
          type: 'string',
          description: 'Filter by section GID (optional).',
        },
        isSubtask: {
          type: 'boolean',
          description: 'Filter by whether the task is a subtask (optional).',
        },
      },
      required: ['workspaceId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const query: Record<string, string | number | boolean | undefined | null> = {};
      if (a.text !== undefined) query.text = String(a.text);
      if (a.completed !== undefined) query.completed = Boolean(a.completed);
      if (a.assignee !== undefined) query['assignee.any'] = String(a.assignee);
      if (a.projectId !== undefined) query['projects.any'] = String(a.projectId);
      if (a.sectionId !== undefined) query['sections.any'] = String(a.sectionId);
      if (a.isSubtask !== undefined) query.is_subtask = Boolean(a.isSubtask);

      const tasks = await asanaRequest<unknown[]>(ctx, `workspaces/${a.workspaceId}/tasks/search`, {
        query,
      });
      return { tasks };
    },
  });
}
