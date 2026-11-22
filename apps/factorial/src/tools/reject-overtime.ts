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
    // A decision on another person's request; the app has no tool that returns it to pending.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
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
