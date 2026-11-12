/**
 * get-zap — get details of a specific Zap by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { zapierRequest } from '../lib/zapier-client.js';

export function registerGetZapTool(app: AgentApp): void {
  app.tool('get-zap', {
    description:
      'Get the details of a specific Zap by its ID, including its name, status, steps, and configuration.',
    parameters: {
      type: 'object',
      properties: {
        zapId: {
          type: 'string',
          description: 'The ID of the Zap to retrieve.',
        },
      },
      required: ['zapId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const zapId = args.zapId as string;

      return await zapierRequest('GET', `/zaps/${zapId}/`, null, ctx);
    },
  });
}
