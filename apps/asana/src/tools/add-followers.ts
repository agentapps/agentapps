import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * add-followers — POST /tasks/{taskId}/addFollowers.
 */
export function registerAddFollowersTool(app: AgentApp): void {
  app.tool('add-followers', {
    description:
      'Add followers to an Asana task (POST /tasks/{taskId}/addFollowers). Returns the updated task. Params: taskId (required), followers (required — array of user GIDs).',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The task GID (required).',
        },
        followers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of user GIDs to add as followers (required).',
        },
      },
      required: ['taskId', 'followers'],
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
      const task = await asanaRequest(ctx, `tasks/${a.taskId}/addFollowers`, {
        method: 'POST',
        body: { followers: a.followers },
      });
      return { task };
    },
  });
}
