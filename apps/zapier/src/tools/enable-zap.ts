/**
 * enable-zap — enable (turn on) a Zap by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { zapierRequest } from '../lib/zapier-client.js';

export function registerEnableZapTool(app: AgentApp): void {
  app.tool('enable-zap', {
    description:
      'Enable (turn on) a Zap by its ID. The Zap will start running and processing triggers.',
    parameters: {
      type: 'object',
      properties: {
        zapId: {
          type: 'string',
          description: 'The ID of the Zap to enable.',
        },
      },
      required: ['zapId'],
    },
    annotations: {
      readOnlyHint: false,
      // disable-zap turns it off again; the switch itself runs no action.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const zapId = args.zapId as string;

      return await zapierRequest('PUT', `/zaps/${zapId}/`, { body: { status: 'on' } }, ctx);
    },
  });
}
