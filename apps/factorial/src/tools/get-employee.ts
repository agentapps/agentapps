import type { AgentApp } from '@agentapps/sdk';
import { factorialRequest } from '../lib/index.js';

export function registerGetEmployeeTool(app: AgentApp): void {
  app.tool('get-employee', {
    description: 'Get detailed information about a specific employee by ID.',
    parameters: {
      type: 'object',
      properties: {
        employeeId: { type: 'number', description: 'The employee ID' },
      },
      required: ['employeeId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      return factorialRequest(ctx, `/employees/employees/${args.employeeId}`);
    },
  });
}
