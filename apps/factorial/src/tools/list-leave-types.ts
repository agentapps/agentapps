import type { AgentApp } from '@agentapps/sdk';
import { factorialRequest } from '../lib/index.js';

export function registerListLeaveTypesTool(app: AgentApp): void {
  app.tool('list-leave-types', {
    description: 'List all available leave types (vacation, sick leave, etc.).',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      return factorialRequest(ctx, '/timeoff/leave_types');
    },
  });
}
