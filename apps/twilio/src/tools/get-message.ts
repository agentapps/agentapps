/**
 * get_message — retrieve a single Twilio message by SID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerGetMessageTool(app: AgentApp): void {
  app.tool('get_message', {
    description: 'Get detailed information about a specific Twilio message by its SID.',
    parameters: {
      type: 'object',
      properties: {
        messageSid: {
          type: 'string',
          description: 'The Twilio message SID (e.g. SM...).',
        },
      },
      required: ['messageSid'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const messageSid = args.messageSid as string;
      return await twilioRequest('GET', `/Messages/${messageSid}`, null, ctx);
    },
  });
}
