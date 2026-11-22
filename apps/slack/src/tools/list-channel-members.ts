import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId } from './_helpers.js';
import { sanitiseBody, sanitizeLimit, wrapSlackCall } from './utils.js';

interface ListChannelMembersArgs {
  channelId: string;
  limit?: number;
  cursor?: string;
  includeRaw?: boolean;
}

export function registerListChannelMembersTool(app: AgentApp): void {
  app.tool('list-channel-members', {
    description:
      'List user ids that are members of a channel. Returns { channelId, members: string[], nextCursor, hasMore }. Retryable. Use list-users + lookup if you need profile info. Params: channelId, limit (1-1000, def 200), cursor?.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Channel id (C... / G... / D... / M...).' },
        limit: { type: 'number', description: 'Max members per page (1-1000, default 200).' },
        cursor: { type: 'string', description: 'Pagination cursor.' },
      },
      required: ['channelId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { channelId, limit, cursor, includeRaw } = args as unknown as ListChannelMembersArgs;
      validateChannelId(channelId, 'channelId');
      const safeLimit = sanitizeLimit(limit, { max: 1000, default: 200 });
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() =>
        client.conversations.members(
          sanitiseBody({ channel: channelId, limit: safeLimit, cursor }) as any,
        ),
      );
      if (includeRaw) return result;
      const members = (result.members ?? []) as string[];
      return {
        channelId,
        members,
        count: members.length,
        nextCursor: result.response_metadata?.next_cursor || null,
        hasMore: Boolean(result.response_metadata?.next_cursor),
      };
    },
  });
}
