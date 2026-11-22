import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * update-task — POST /tasks/{taskId}.
 */
export function registerUpdateTaskTool(app: AgentApp): void {
  app.tool('update-task', {
    description:
      'Update an existing Todoist task (POST /tasks/{taskId}). Returns the updated task. Params: taskId (required), content? (new title), description? (new description), dueString? (new due date in natural language), dueDate? (YYYY-MM-DD), priority? (1-4), labels? (array of label names).',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task ID to update (required).',
        },
        content: {
          type: 'string',
          description: 'New task content (optional).',
        },
        description: {
          type: 'string',
          description: 'New task description (optional).',
        },
        dueString: {
          type: 'string',
          description: 'New due date in natural language (optional).',
        },
        dueDate: {
          type: 'string',
          description: 'New due date in YYYY-MM-DD format (optional).',
        },
        priority: {
          type: 'number',
          description: 'New priority from 1-4 (optional).',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'New array of label names (optional).',
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
      if (a.content) body.content = a.content;
      if (a.description) body.description = a.description;
      if (a.dueString) body.due_string = a.dueString;
      if (a.dueDate) body.due_date = a.dueDate;
      if (a.priority) body.priority = a.priority;
      if (a.labels) body.labels = a.labels;

      const task = await todoistRequest(ctx, `/tasks/${a.taskId}`, { method: 'POST', body });
      return { task };
    },
  });
}
