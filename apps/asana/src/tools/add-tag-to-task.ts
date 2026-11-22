import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * add-tag-to-task — POST /tasks/{taskId}/addTag.
 */
export function registerAddTagToTaskTool(app: AgentApp): void {
  app.tool('add-tag-to-task', {
    description:
      'Add a tag to an Asana task (POST /tasks/{taskId}/addTag). Returns an empty object on success. Params: taskId (required), tagId (required).',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task GID (required).',
        },
        tagId: {
          type: 'string',
          description: 'The tag GID to add (required).',
        },
      },
      required: ['taskId', 'tagId'],
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
      await asanaRequest(ctx, `tasks/${a.taskId}/addTag`, {
        method: 'POST',
        body: { tag: String(a.tagId) },
      });
      return { added: true };
    },
  });
}
