/**
 * list_messages — list SMS messages from your Twilio account.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerListMessagesTool(app: AgentApp): void {
  app.tool('list_messages', {
    description:
      'List SMS messages from your Twilio account. Supports filtering by sender, recipient, and date.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Filter by destination phone number in E.164 format.',
        },
        from: {
          type: 'string',
          description: 'Filter by sender phone number in E.164 format.',
        },
        dateSent: {
          type: 'string',
          description: 'Filter by date sent (YYYY-MM-DD).',
        },
        pageSize: {
          type: 'number',
          description: 'Number of messages to return (default 20).',
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
      if (args.to) params.To = args.to;
      if (args.from) params.From = args.from;
      if (args.dateSent) params.DateSent = args.dateSent;

      const response = (await twilioRequest('GET', '/Messages', params, ctx)) as Record<
        string,
        unknown
      >;
      return {
        messages: response.messages,
        page: response.page,
        pageSize: response.page_size,
      };
    },
  });
}
