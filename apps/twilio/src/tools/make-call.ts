/**
 * make-call — initiate a phone call via Twilio.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerMakeCallTool(app: AgentApp): void {
  app.tool('make-call', {
    description:
      'Initiate a phone call via Twilio. Provide either a TwiML URL or inline TwiML markup to control call behavior. Returns the call object.',
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
        url: {
          type: 'string',
          description: 'TwiML URL that controls the call flow. Provide this or twiml, not both.',
        },
        twiml: {
          type: 'string',
          description:
            'Inline TwiML markup to control the call (e.g. "<Response><Say>Hello</Say></Response>"). Provide this or url, not both.',
        },
        statusCallback: {
          type: 'string',
          description: 'Optional webhook URL to receive call status updates.',
        },
      },
      required: ['to', 'from'],
    },
    annotations: {
      readOnlyHint: false,
      // A placed call reaches another person, is billed, and cannot be taken back.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      if (!args.url && !args.twiml) {
        throw new Error('Either "url" or "twiml" must be provided.');
      }

      const params: Record<string, unknown> = {
        To: args.to as string,
        From: args.from as string,
      };
      if (args.url) params.Url = args.url;
      if (args.twiml) params.Twiml = args.twiml;
      if (args.statusCallback) params.StatusCallback = args.statusCallback;

      return await twilioRequest('POST', '/Calls', params, ctx);
    },
  });
}
