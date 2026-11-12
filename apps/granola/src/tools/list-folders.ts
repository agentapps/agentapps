/**
 * list-folders — list Granola folders accessible to the user.
 *
 * Folders are ordered alphabetically. Hierarchy is indicated via parent_folder_id.
 */

import type { AgentApp } from '@agentapps/sdk';
import { GranolaClient } from '../lib/index.js';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 30;

export function registerListFoldersTool(app: AgentApp): void {
  app.tool('list-folders', {
    description:
      'List Granola folders accessible to the user. Returns folder hierarchy via parent_folder_id.',
    parameters: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response.',
        },
        page_size: {
          type: 'number',
          description: `Results per page (default: ${DEFAULT_PAGE_SIZE}, max: ${MAX_PAGE_SIZE}).`,
          default: DEFAULT_PAGE_SIZE,
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const apiKey = await ctx.installationSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY user secret.');

      const pageSize = Math.min(
        Math.max(1, (args.page_size as number | undefined) ?? DEFAULT_PAGE_SIZE),
        MAX_PAGE_SIZE,
      );

      const client = new GranolaClient(apiKey);
      const result = await client.listFolders({
        cursor: args.cursor as string | undefined,
        page_size: pageSize,
      });

      return {
        folders: result.folders,
        hasMore: result.hasMore,
        cursor: result.cursor,
      };
    },
  });
}
