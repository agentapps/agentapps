import type { AgentApp } from '@agentapps/sdk';
import { factorialRequest } from '../lib/index.js';

export function registerGetLeaveTool(app: AgentApp): void {
  app.tool('get-leave', {
    description: 'Get detailed information about a specific time-off request by ID.',
    parameters: {
      type: 'object',
      properties: {
        leaveId: { type: 'number', description: 'The leave ID' },
      },
      required: ['leaveId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      return factorialRequest(ctx, `/timeoff/leaves/${args.leaveId}`);
    },
  });
}
