/**
 * send-whatsapp — send a WhatsApp message via Twilio.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerSendWhatsappTool(app: AgentApp): void {
  app.tool('send-whatsapp', {
    description:
      'Send a WhatsApp message via Twilio. The sender must be a Twilio WhatsApp-enabled number or sandbox number. Returns the message object with sid and status.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description:
            'Destination phone number in E.164 format (e.g. +14155551234). The whatsapp: prefix is added automatically.',
        },
        from: {
          type: 'string',
          description:
            'Your Twilio WhatsApp-enabled number in E.164 format (e.g. +14155559876). The whatsapp: prefix is added automatically.',
        },
        body: {
          type: 'string',
          description: 'The text content of the WhatsApp message.',
        },
        mediaUrl: {
          type: 'string',
          description: 'Optional URL of media to include (image, video, etc.).',
        },
        statusCallback: {
          type: 'string',
          description: 'Optional webhook URL to receive message status updates.',
        },
      },
      required: ['to', 'from', 'body'],
    },
    annotations: {
      readOnlyHint: false,
      // A sent message reaches another person, is billed, and cannot be taken back.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const to = args.to as string;
      const from = args.from as string;

      const params: Record<string, unknown> = {
        To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
        Body: args.body as string,
      };
      if (args.mediaUrl) params.MediaUrl = args.mediaUrl;
      if (args.statusCallback) params.StatusCallback = args.statusCallback;

      return await twilioRequest('POST', '/Messages', params, ctx);
    },
  });
}
