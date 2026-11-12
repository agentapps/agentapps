/**
 * list_recordings — list recordings from your Twilio account.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerListRecordingsTool(app: AgentApp): void {
  app.tool('list_recordings', {
    description:
      'List recordings from your Twilio account. Supports filtering by date and call SID.',
    parameters: {
      type: 'object',
      properties: {
        callSid: {
          type: 'string',
          description: 'Filter by the call SID that generated the recording.',
        },
        dateCreated: {
          type: 'string',
          description: 'Filter by date created (YYYY-MM-DD).',
        },
        pageSize: {
          type: 'number',
          description: 'Number of recordings to return (default 20).',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        PageSize: (args.pageSize as number) || 20,
      };
      if (args.callSid) params.CallSid = args.callSid;
      if (args.dateCreated) params.DateCreated = args.dateCreated;

      const response = (await twilioRequest('GET', '/Recordings', params, ctx)) as Record<
        string,
        unknown
      >;
      return {
        recordings: response.recordings,
        page: response.page,
        pageSize: response.page_size,
      };
    },
  });
}
