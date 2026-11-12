/**
 * search_users — search for users in Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_EXPORT_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerSearchUsersTool(app: AgentApp): void {
  app.tool('search_users', {
    description:
      'Search for users in Amplitude by user ID, device ID, or other identifiers. Returns matching user records with their IDs and metadata.',
    parameters: {
      type: 'object',
      properties: {
        user: {
          type: 'string',
          description: 'The search query — a user ID, device ID, or Amplitude ID to search for.',
        },
      },
      required: ['user'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, string | number | boolean | undefined | null> = {
        user: args.user as string,
      };

      return await amplitudeRequest('GET', AMPLITUDE_EXPORT_URL, '/usersearch', params, ctx);
    },
  });
}
