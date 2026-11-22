/**
 * get-execution-log — retrieve details of a specific Zapier NLA execution.
 */

import type { AgentApp } from '@agentapps/sdk';
import { zapierRequest } from '../lib/zapier-client.js';

export function registerGetExecutionLogTool(app: AgentApp): void {
  app.tool('get-execution-log', {
    description:
      'Get the details and result of a specific Zapier NLA execution by its execution ID.',
    parameters: {
      type: 'object',
      properties: {
        executionId: {
          type: 'string',
          description: 'The ID of the execution to retrieve.',
        },
      },
      required: ['executionId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const executionId = args.executionId as string;

      return await zapierRequest('GET', `/execution-log/${executionId}/`, null, ctx);
    },
  });
}
