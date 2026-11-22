import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractChannel, isUserId } from './_helpers.js';
import { sanitiseBody, sanitizeLimit, wrapSlackCall } from './utils.js';

interface ListUserChannelsArgs {
  userId?: string;
  types?: string;
  excludeArchived?: boolean;
  limit?: number;
  cursor?: string;
  includeRaw?: boolean;
}

export function registerListUserChannelsTool(app: AgentApp): void {
  app.tool('list-user-channels', {
    description:
      'List channels a user is a member of. Returns { channels, nextCursor, hasMore }. Retryable. Params: userId? (def authed), types? (csv: public_channel,private_channel,mpim,im), excludeArchived (def true), limit (1-1000, def 200), cursor?.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User id (def authenticated user).' },
        types: {
          type: 'string',
          description: 'Comma-separated types: public_channel,private_channel,mpim,im.',
        },
        excludeArchived: { type: 'boolean', description: 'Skip archived. Default true.' },
        limit: { type: 'number', description: 'Per page (1-1000, default 200).' },
        cursor: { type: 'string', description: 'Pagination cursor.' },
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
      const { userId, types, excludeArchived, limit, cursor, includeRaw } =
        args as unknown as ListUserChannelsArgs;
      if (userId !== undefined && !isUserId(userId)) {
        throw new Error(`Invalid userId: expected U.../W..., got "${userId}"`);
      }
      const safeLimit = sanitizeLimit(limit, { max: 1000, default: 200 });
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() =>
        client.users.conversations(
          sanitiseBody({
            user: userId,
            types,
            exclude_archived: excludeArchived ?? true,
            limit: safeLimit,
            cursor,
          }) as any,
        ),
      );
      if (includeRaw) return result;
      const channels = ((result.channels ?? []) as any[]).map(extractChannel);
      return {
        userId: userId ?? null,
        channels,
        count: channels.length,
        nextCursor: result.response_metadata?.next_cursor || null,
        hasMore: Boolean(result.response_metadata?.next_cursor),
      };
    },
  });
}
