import type { AgentApp } from '@agentapps/sdk';
import { todoistRequest } from '../lib/todoist-client.js';

/**
 * create-task — POST /tasks.
 */
export function registerCreateTaskTool(app: AgentApp): void {
  app.tool('create-task', {
    description:
      "Create a new Todoist task (POST /tasks). Returns the created task. Params: content (required — task title), description? (task description), projectId? (project ID), dueString? (natural language due date, e.g. 'tomorrow at 12:00', 'every monday'), dueDate? (YYYY-MM-DD), priority? (1=normal to 4=urgent), labels? (array of label names).",
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Task content / title (required).',
        },
        description: {
          type: 'string',
          description: 'Task description (optional).',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (optional, defaults to inbox).',
        },
        dueString: {
          type: 'string',
          description: "Due date in natural language (optional, e.g. 'tomorrow at 12:00').",
        },
        dueDate: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format (optional).',
        },
        priority: {
          type: 'number',
          description: 'Priority from 1 (normal) to 4 (urgent) (optional).',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of label names (optional).',
        },
      },
      required: ['content'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body: Record<string, unknown> = { content: a.content };
      if (a.description) body.description = a.description;
      if (a.projectId) body.project_id = a.projectId;
      if (a.dueString) body.due_string = a.dueString;
      if (a.dueDate) body.due_date = a.dueDate;
      if (a.priority) body.priority = a.priority;
      if (a.labels) body.labels = a.labels;

      const task = await todoistRequest(ctx, '/tasks', { method: 'POST', body });
      return { task };
    },
  });
}
