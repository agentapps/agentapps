import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { FILE_FIELDS } from './_fields.js';
import { extractFile, validateChannelId, validateUserId } from './_helpers.js';
import { resolveFieldsList, sanitizeLimit, wrapSlackCall } from './utils.js';

interface ListFilesArgs {
  channel?: string;
  user?: string;
  limit?: number;
  page?: number;
  tsFrom?: string;
  tsTo?: string;
  types?: string;
  fields?: string[];
  includeRaw?: boolean;
  cursor?: string;
}

const TYPES_ENUM = ['all', 'spaces', 'snippets', 'images', 'gdocs', 'zips', 'pdfs'];

export function registerListFilesTool(app: AgentApp): void {
  app.tool('list-files', {
    description:
      'List uploaded files. Returns curated rows { id, name, title, mimetype, prettyType, size, user, urlPrivate, permalink, thumbUrl, createdAt } + paging. Params: channel?, user?, limit (1-100, def 20), page (def 1), tsFrom, tsTo, types? (CSV all|spaces|snippets|images|gdocs|zips|pdfs), fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Filter by channel id.',
        },
        user: {
          type: 'string',
          description: 'Filter by uploader user id.',
        },
        limit: {
          type: 'number',
          description: 'Results per page. Min 1, max 100, default 20.',
        },
        page: {
          type: 'number',
          description: 'Page number (1-indexed). Default 1.',
        },
        tsFrom: {
          type: 'string',
          description: 'Filter files created after this Unix timestamp.',
        },
        tsTo: {
          type: 'string',
          description: 'Filter files created before this Unix timestamp.',
        },
        types: {
          type: 'string',
          description: `Comma-separated types from ${TYPES_ENUM.join(', ')}. Default all.`,
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist per row.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Slack file objects. Default false.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { channel, user, limit, page, tsFrom, tsTo, types, fields, includeRaw } =
        args as ListFilesArgs;
      if (channel) validateChannelId(channel, 'channel');
      if (user) validateUserId(user, 'user');
      const pageSize = sanitizeLimit(limit, { max: 100, default: 20 });
      const pageNumber = sanitizeLimit(page, { max: 1000, default: 1 });

      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() =>
        client.files.list({
          channel,
          user,
          count: pageSize,
          page: pageNumber,
          ts_from: tsFrom,
          ts_to: tsTo,
          types: types ?? 'all',
        }),
      );

      const rawFiles = result.files ?? [];
      const shaped = rawFiles.map((f: any) => extractFile(f));
      const filesOut = resolveFieldsList(shaped as any, rawFiles, {
        includeRaw,
        fields,
        defaultFields: FILE_FIELDS,
      });

      return {
        files: filesOut,
        total: filesOut.length,
        paging: result.paging ?? { count: 0, total: 0, page: pageNumber, pages: 1 },
      };
    },
  });
}
