import type { AgentApp } from '@agentapps/sdk';
import { factorialRequest } from '../lib/index.js';

export function registerRejectOvertimeTool(app: AgentApp): void {
  app.tool('reject-overtime', {
    description: 'Reject an overtime request by ID.',
    parameters: {
      type: 'object',
      properties: {
        overtimeRequestId: { type: 'number', description: 'The overtime request ID to reject' },
      },
      required: ['overtimeRequestId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      return factorialRequest(
        ctx,
        `/attendance/overtime_requests/${args.overtimeRequestId}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
    },
  });
}
