import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import { clampInt, shapeFolder } from './_helpers.js';

interface ListFoldersResponse {
  folders?: unknown[];
  count?: number;
}

/**
 * list-folders — GET /contacts/folders.
 *
 * Folders group contact lists. `create-list` requires a `folderId`, so this is
 * the discovery step: the agent lists folders, then creates a list inside one.
 */
export function registerListFoldersTool(app: AgentApp): void {
  app.tool('list-folders', {
    description:
      'List contact folders from Brevo (GET /contacts/folders). Folders group contact lists; a folderId is required to create a list, so use this to discover one. Returns { folders:[{id,name,totalSubscribers,uniqueSubscribers,totalBlacklisted}], count, limit, offset }. Params: limit? (1-50, default 50), offset? (default 0).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max folders to return (1-50, default 50).',
          default: 50,
        },
        offset: {
          type: 'number',
          description: 'Index of the first folder for pagination (default 0).',
          default: 0,
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const limit = clampInt(a.limit, 1, 50, 50);
      const offset = clampInt(a.offset, 0, Number.MAX_SAFE_INTEGER, 0);

      const res = await brevoRequest<ListFoldersResponse>(ctx, '/contacts/folders', {
        query: { limit, offset },
      });

      const folders = (res.folders ?? []).map(shapeFolder);
      return {
        folders,
        count: typeof res.count === 'number' ? res.count : folders.length,
        limit,
        offset,
      };
    },
  });
}
