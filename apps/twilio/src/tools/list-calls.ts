/**
 * list_calls — list calls from your Twilio account.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerListCallsTool(app: AgentApp): void {
  app.tool('list_calls', {
    description:
      'List calls from your Twilio account. Supports filtering by phone number and call status.',
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Filter by destination phone number in E.164 format.',
        },
        from: {
          type: 'string',
          description: 'Filter by caller phone number in E.164 format.',
        },
        status: {
          type: 'string',
          description: 'Filter by call status.',
          enum: [
            'queued',
            'ringing',
            'in-progress',
            'completed',
            'busy',
            'failed',
            'no-answer',
            'canceled',
          ],
        },
        pageSize: {
          type: 'number',
          description: 'Number of calls to return (default 20).',
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
      if (args.status) params.Status = args.status;

      const response = (await twilioRequest('GET', '/Calls', params, ctx)) as Record<
        string,
        unknown
      >;
      return {
        calls: response.calls,
        page: response.page,
        pageSize: response.page_size,
      };
    },
  });
}
