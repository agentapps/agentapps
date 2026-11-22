/**
 * list-available-numbers — search for available local phone numbers to purchase.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerListAvailableNumbersTool(app: AgentApp): void {
  app.tool('list-available-numbers', {
    description:
      'Search for available local phone numbers that can be purchased. Filter by area code, region, or capabilities.',
    parameters: {
      type: 'object',
      properties: {
        countryCode: {
          type: 'string',
          description: 'ISO 3166-1 alpha-2 country code (e.g. "US", "GB", "CA").',
        },
        areaCode: {
          type: 'string',
          description: 'Filter by area code (e.g. "415").',
        },
        contains: {
          type: 'string',
          description:
            'Pattern to match in the phone number. Use * for wildcard (e.g. "510555****").',
        },
        inRegion: {
          type: 'string',
          description: 'Filter by region/state (e.g. "CA" for California).',
        },
        inPostalCode: {
          type: 'string',
          description: 'Filter by postal/ZIP code.',
        },
        smsEnabled: {
          type: 'boolean',
          description: 'Filter for numbers with SMS capability.',
        },
        voiceEnabled: {
          type: 'boolean',
          description: 'Filter for numbers with voice capability.',
        },
        pageSize: {
          type: 'number',
          description: 'Number of results to return (default 20).',
        },
      },
      required: ['countryCode'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const countryCode = args.countryCode as string;
      const params: Record<string, unknown> = {
        PageSize: (args.pageSize as number) || 20,
      };
      if (args.areaCode) params.AreaCode = args.areaCode;
      if (args.contains) params.Contains = args.contains;
      if (args.inRegion) params.InRegion = args.inRegion;
      if (args.inPostalCode) params.InPostalCode = args.inPostalCode;
      if (args.smsEnabled !== undefined) params.SmsEnabled = args.smsEnabled;
      if (args.voiceEnabled !== undefined) params.VoiceEnabled = args.voiceEnabled;

      const response = (await twilioRequest(
        'GET',
        `/AvailablePhoneNumbers/${countryCode}/Local`,
        params,
        ctx,
      )) as Record<string, unknown>;
      return {
        availablePhoneNumbers: response.available_phone_numbers,
      };
    },
  });
}
