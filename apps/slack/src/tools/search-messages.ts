import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { SEARCH_MESSAGE_HIT_FIELDS } from './_fields.js';
import { extractSearchMessageHit } from './_helpers.js';
import { resolveFieldsList, sanitizeLimit, wrapSlackCall } from './utils.js';

interface SearchMessagesArgs {
  query: string;
  sort?: 'score' | 'timestamp';
  sortDirection?: 'asc' | 'desc';
  count?: number;
  page?: number;
  highlight?: boolean;
  fields?: string[];
  includeRaw?: boolean;
}

export function registerSearchMessagesTool(app: AgentApp): void {
  app.tool('search-messages', {
    description:
      'Search messages workspace-wide. Supports Slack search syntax (in:#channel, from:@user, before/after). Returns curated hits { ts, channel, channelName, user, userName, text, permalink, score } + total + page. Params: query, sort? (score|timestamp), sortDirection? (asc|desc), count (1-100, def 20), page, highlight, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Slack search query (supports operators like in:#channel, from:@user).',
        },
        sort: {
          type: 'string',
          enum: ['score', 'timestamp'],
          description: 'Sort by relevance or time. Default score.',
        },
        sortDirection: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction. Default desc.',
        },
        count: {
          type: 'number',
          description: 'Results per page. Min 1, max 100, default 20.',
        },
        page: {
          type: 'number',
          description: 'Page number (1-indexed). Default 1.',
        },
        highlight: {
          type: 'boolean',
          description: 'Highlight matching terms in returned text. Default false.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist per hit.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Slack search.matches[]. Default false.',
        },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { query, sort, sortDirection, count, page, highlight, fields, includeRaw } =
        args as unknown as SearchMessagesArgs;
      if (typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('query must be a non-empty string.');
      }
      const pageSize = sanitizeLimit(count, { max: 100, default: 20 });
      const pageNumber = sanitizeLimit(page, { max: 100, default: 1 });

      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() =>
        client.search.messages({
          query,
          sort: sort ?? 'score',
          sort_dir: sortDirection ?? 'desc',
          count: pageSize,
          page: pageNumber,
          highlight: highlight ?? false,
        }),
      );

      const rawMatches = result.messages?.matches ?? [];
      const shaped = rawMatches.map(extractSearchMessageHit);
      const matches = resolveFieldsList(shaped as any, rawMatches, {
        includeRaw,
        fields,
        defaultFields: SEARCH_MESSAGE_HIT_FIELDS,
      });

      return {
        matches,
        total: result.messages?.total ?? matches.length,
        page: pageNumber,
        pagination: result.messages?.pagination ?? null,
      };
    },
  });
}
