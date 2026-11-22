/**
 * list_phone_numbers — list incoming phone numbers on your Twilio account.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerListPhoneNumbersTool(app: AgentApp): void {
  app.tool('list_phone_numbers', {
    description:
      'List incoming phone numbers on your Twilio account. Optionally filter by phone number.',
    parameters: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'Filter by phone number (exact match in E.164 format).',
        },
        pageSize: {
          type: 'number',
          description: 'Number of phone numbers to return (default 20).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        PageSize: (args.pageSize as number) || 20,
      };
      if (args.phoneNumber) params.PhoneNumber = args.phoneNumber;

      const response = (await twilioRequest('GET', '/IncomingPhoneNumbers', params, ctx)) as Record<
        string,
        unknown
      >;
      return {
        phoneNumbers: response.incoming_phone_numbers,
      };
    },
  });
}
