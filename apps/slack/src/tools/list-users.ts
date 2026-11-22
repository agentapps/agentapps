import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { USER_COMPACT_FIELDS } from './_fields.js';
import { extractUser } from './_helpers.js';
import { resolveFieldsList, sanitizeLimit, wrapSlackCall } from './utils.js';

interface ListUsersArgs {
  limit?: number;
  cursor?: string;
  includeDeleted?: boolean;
  includeBots?: boolean;
  fields?: string[];
  includeRaw?: boolean;
}

export function registerListUsersTool(app: AgentApp): void {
  app.tool('list-users', {
    description:
      'List workspace users. Returns curated rows { id, name, realName, displayName, email, imageUrl, isBot, isAdmin, isOwner, deleted, tz } + nextCursor. Params: limit (1-200, def 100), cursor, includeDeleted (def false), includeBots (def true), fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Results per page. Min 1, max 200, default 100.',
        },
        cursor: {
          type: 'string',
          description: 'Slack cursor from previous response.nextCursor.',
        },
        includeDeleted: {
          type: 'boolean',
          description: 'Include deactivated users. Default false.',
        },
        includeBots: {
          type: 'boolean',
          description: 'Include bot users. Default true.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist per row.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Slack user objects. Default false.',
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
      const { limit, cursor, includeDeleted, includeBots, fields, includeRaw } =
        args as ListUsersArgs;
      const pageSize = sanitizeLimit(limit, { max: 200, default: 100 });
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() =>
        client.users.list({
          limit: pageSize,
          cursor,
          include_locale: false,
        }),
      );

      let rawUsers = result.members ?? [];
      if (includeDeleted !== true) {
        rawUsers = rawUsers.filter((u) => !u.deleted);
      }
      if (includeBots === false) {
        rawUsers = rawUsers.filter((u) => !u.is_bot);
      }
      const shaped = rawUsers.map(extractUser);
      const users = resolveFieldsList(shaped as any, rawUsers, {
        includeRaw,
        fields,
        defaultFields: USER_COMPACT_FIELDS,
      });

      return {
        users,
        total: users.length,
        hasMore: !!result.response_metadata?.next_cursor,
        nextCursor: result.response_metadata?.next_cursor || null,
      };
    },
  });
}
