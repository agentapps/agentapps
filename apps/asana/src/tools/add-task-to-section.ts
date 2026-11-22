import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * add-task-to-section — POST /sections/{sectionId}/addTask.
 */
export function registerAddTaskToSectionTool(app: AgentApp): void {
  app.tool('add-task-to-section', {
    description:
      'Add a task to a section in an Asana project (POST /sections/{sectionId}/addTask). Returns an empty object on success. Params: sectionId (required), taskId (required).',
    parameters: {
      type: 'object',
      properties: {
        sectionId: {
          type: 'string',
          description: 'The section GID to add the task to (required).',
        },
        taskId: {
          type: 'string',
          description: 'The task GID to add (required).',
        },
      },
      required: ['sectionId', 'taskId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      await asanaRequest(ctx, `sections/${a.sectionId}/addTask`, {
        method: 'POST',
        body: { task: String(a.taskId) },
      });
      return { added: true };
    },
  });
}
