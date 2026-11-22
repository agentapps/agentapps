/**
 * get-user-activity — get user activity from Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_EXPORT_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerGetUserActivityTool(app: AgentApp): void {
  app.tool('get-user-activity', {
    description:
      'Get recent activity for a specific user in Amplitude. Returns a list of events performed by the user.',
    parameters: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'The Amplitude user ID to look up.',
        },
        offset: {
          type: 'number',
          description: 'Offset for pagination (number of events to skip). Defaults to 0.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return. Defaults to 1000.',
        },
      },
      required: ['user'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const params: Record<string, string | number | boolean | undefined | null> = {
        user: args.user as string,
      };
      if (args.offset !== undefined) params.offset = args.offset as number;
      if (args.limit !== undefined) params.limit = args.limit as number;

      return await amplitudeRequest('GET', AMPLITUDE_EXPORT_URL, '/useractivity', params, ctx);
    },
  });
}
