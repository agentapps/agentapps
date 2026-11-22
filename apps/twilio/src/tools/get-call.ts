/**
 * get_call — retrieve a single Twilio call by SID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerGetCallTool(app: AgentApp): void {
  app.tool('get_call', {
    description: 'Get detailed information about a specific Twilio call by its SID.',
    parameters: {
      type: 'object',
      properties: {
        callSid: {
          type: 'string',
          description: 'The Twilio call SID (e.g. CA...).',
        },
      },
      required: ['callSid'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const callSid = args.callSid as string;
      return await twilioRequest('GET', `/Calls/${callSid}`, null, ctx);
    },
  });
}
