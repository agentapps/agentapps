import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * update-task — PUT /tasks/{taskId}.
 */
export function registerUpdateTaskTool(app: AgentApp): void {
  app.tool('update-task', {
    description:
      'Update an existing Asana task (PUT /tasks/{taskId}). Returns the updated task. Params: taskId (required), name? (new title), completed? (boolean), notes? (new description).',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task GID to update (required).',
        },
        name: {
          type: 'string',
          description: 'New task name (optional).',
        },
        completed: {
          type: 'boolean',
          description: 'Mark task as completed or not (optional).',
        },
        notes: {
          type: 'string',
          description: 'New task notes / description (optional).',
        },
      },
      required: ['taskId'],
    },
    // Setting the fields again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body: Record<string, unknown> = {};
      if (a.name !== undefined) body.name = a.name;
      if (a.completed !== undefined) body.completed = a.completed;
      if (a.notes !== undefined) body.notes = a.notes;

      const task = await asanaRequest(ctx, `tasks/${a.taskId}`, { method: 'PUT', body });
      return { task };
    },
  });
}
