import type { AgentApp } from '@agentapps/sdk';
import { factorialRequest } from '../lib/index.js';

export function registerApproveOvertimeTool(app: AgentApp): void {
  app.tool('approve-overtime', {
    description: 'Approve an overtime request by ID.',
    parameters: {
      type: 'object',
      properties: {
        overtimeRequestId: { type: 'number', description: 'The overtime request ID to approve' },
      },
      required: ['overtimeRequestId'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      return factorialRequest(
        ctx,
        `/attendance/overtime_requests/${args.overtimeRequestId}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
    },
  });
}
