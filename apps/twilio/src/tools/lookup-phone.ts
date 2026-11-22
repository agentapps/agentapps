/**
 * lookup_phone — look up information about a phone number via the Twilio Lookups API.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioLookupRequest } from '../lib/twilio-client.js';

export function registerLookupPhoneTool(app: AgentApp): void {
  app.tool('lookup_phone', {
    description:
      'Look up information about a phone number using the Twilio Lookups API. Returns carrier, caller name, and formatting details.',
    parameters: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'The phone number to look up in E.164 format (e.g. +14155551234).',
        },
        type: {
          type: 'string',
          description:
            'Comma-separated list of lookup types (e.g. "carrier", "caller-name", or "carrier,caller-name").',
        },
        countryCode: {
          type: 'string',
          description:
            'ISO 3166-1 alpha-2 country code. Used if phoneNumber is in national format.',
        },
      },
      required: ['phoneNumber'],
    },
    // A GET that changes nothing, though Twilio bills carrier and caller-name lookups per request.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const phoneNumber = args.phoneNumber as string;
      const params: Record<string, unknown> = {};
      if (args.type) params.Type = args.type;
      if (args.countryCode) params.CountryCode = args.countryCode;

      return await twilioLookupRequest(phoneNumber, params, ctx);
    },
  });
}
