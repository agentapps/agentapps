/**
 * get_user_profile — get a user profile from Mixpanel.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerGetUserProfileTool(app: AgentApp): void {
  app.tool('get_user_profile', {
    description:
      'Get a user profile (People record) from Mixpanel by distinct_id. Returns user properties and metadata.',
    parameters: {
      type: 'object',
      properties: {
        distinct_id: {
          type: 'string',
          description: 'The distinct_id of the user to look up.',
        },
      },
      required: ['distinct_id'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      return await mixpanelRequest(
        'GET',
        MIXPANEL_QUERY_URL,
        '/engage',
        {
          distinct_id: args.distinct_id as string,
        },
        ctx,
      );
    },
  });
}
