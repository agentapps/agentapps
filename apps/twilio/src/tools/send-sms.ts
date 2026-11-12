/**
 * send_sms — send an SMS message via Twilio.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerSendSmsTool(app: AgentApp): void {
  app.tool('send_sms', {
    description:
      'Send an SMS message via Twilio. Returns the message object with sid, status, and delivery details.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Destination phone number in E.164 format (e.g. +14155551234).',
        },
        from: {
          type: 'string',
          description: 'Your Twilio phone number in E.164 format (e.g. +14155559876).',
        },
        body: {
          type: 'string',
          description: 'The text content of the SMS message.',
        },
        statusCallback: {
          type: 'string',
          description: 'Optional webhook URL to receive message status updates.',
        },
      },
      required: ['to', 'from', 'body'],
    },
    annotations: { sensitive: true, readOnlyHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        To: args.to as string,
        From: args.from as string,
        Body: args.body as string,
      };
      if (args.statusCallback) params.StatusCallback = args.statusCallback;

      return await twilioRequest('POST', '/Messages', params, ctx);
    },
  });
}
