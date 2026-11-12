import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractPresence, validateUserId } from './_helpers.js';
import { wrapSlackCall } from './utils.js';

interface GetUserPresenceArgs {
  userId: string;
  includeRaw?: boolean;
}

export function registerGetUserPresenceTool(app: AgentApp): void {
  app.tool('get-user-presence', {
    description:
      'Get presence for a Slack user. Returns { user, presence, online, autoAway, manualAway, connectionCount, lastActivity }. Params: userId.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'Slack user id (U... or W...).',
        },
      },
      required: ['userId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { userId, includeRaw } = args as unknown as GetUserPresenceArgs;
      validateUserId(userId, 'userId');
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() => client.users.getPresence({ user: userId }));
      if (includeRaw) return result;
      return extractPresence(userId, result);
    },
  });
}
