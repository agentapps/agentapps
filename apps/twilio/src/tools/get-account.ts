/**
 * get_account — retrieve your Twilio account information.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerGetAccountTool(app: AgentApp): void {
  app.tool('get_account', {
    description:
      'Get information about your Twilio account, including SID, friendly name, status, and type.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      return await twilioRequest('GET', '', null, ctx);
    },
  });
}
