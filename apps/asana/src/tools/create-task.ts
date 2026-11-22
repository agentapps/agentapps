import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * create-task — POST /tasks.
 */
export function registerCreateTaskTool(app: AgentApp): void {
  app.tool('create-task', {
    description:
      'Create a new Asana task (POST /tasks). Returns the created task. Params: name (required — task title), projects? (array of project GIDs), workspace? (workspace GID — required if projects is not set), notes? (task description), assignee? (user GID or email).',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Task name / title (required).',
        },
        projects: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of project GIDs to add the task to (optional).',
        },
        workspace: {
          type: 'string',
          description: 'Workspace GID (required if projects is not set).',
        },
        notes: {
          type: 'string',
          description: 'Task description / notes (optional).',
        },
        assignee: {
          type: 'string',
          description: 'Assignee — user GID or email address (optional).',
        },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body: Record<string, unknown> = { name: a.name };
      if (a.projects) body.projects = a.projects;
      if (a.workspace) body.workspace = a.workspace;
      if (a.notes) body.notes = a.notes;
      if (a.assignee) body.assignee = a.assignee;

      const task = await asanaRequest(ctx, 'tasks', { method: 'POST', body });
      return { task };
    },
  });
}
