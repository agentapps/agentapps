/**
 * disable-zap — disable (turn off) a Zap by ID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { zapierRequest } from '../lib/zapier-client.js';

export function registerDisableZapTool(app: AgentApp): void {
  app.tool('disable-zap', {
    description:
      'Disable (turn off) a Zap by its ID. The Zap will stop running and no longer process triggers.',
    parameters: {
      type: 'object',
      properties: {
        zapId: {
          type: 'string',
          description: 'The ID of the Zap to disable.',
        },
      },
      required: ['zapId'],
    },
    annotations: {
      readOnlyHint: false,
      // enable-zap turns it back on, though triggers that fire meanwhile are not processed.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const zapId = args.zapId as string;

      return await zapierRequest('PUT', `/zaps/${zapId}/`, { body: { status: 'off' } }, ctx);
    },
  });
}
