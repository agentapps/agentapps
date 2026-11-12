import type { AgentApp } from '@agentapps/sdk';
import { runnRequest } from '../lib/runn-client.js';
import { validateId } from './_runn-helpers.js';

export function registerDeleteAssignmentTool(app: AgentApp): void {
  app.tool('runn-delete-assignment', {
    description:
      'Delete a Runn assignment by id. Irreversible. Returns { success, assignmentId }. Params: assignmentId (required).',
    parameters: {
      type: 'object',
      properties: {
        assignmentId: { type: 'number', description: 'Runn assignment id to delete.' },
      },
      required: ['assignmentId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { assignmentId } = args as { assignmentId: number };
      validateId(assignmentId, 'assignmentId');

      await runnRequest(`/assignments/${assignmentId}`, ctx, { method: 'DELETE' });
      return { success: true, assignmentId };
    },
  });
}
