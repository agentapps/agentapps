import type { AgentApp } from '@agentapps/sdk';
import { type Args, readPage } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';

interface MediaItem {
  id: string;
  name?: string;
  originalName?: string | null;
  path?: string;
  createdAt?: string;
}

export function registerListMediaTool(app: AgentApp): void {
  /** @spec POSTIZ-REQ-12 */
  app.tool('list-media', {
    description:
      'List the files in the Postiz media library, 18 per page. Returns { files: [{ id, url, name, createdAt }], page, pages }. Pass { id, url } in the media of create-draft, schedule-post or publish-post. Ask for the next page while page < pages.',
    parameters: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, description: 'Page number, from 1. Default 1.' },
        search: {
          type: 'string',
          description: 'Filter by the file name as uploaded, ignoring case.',
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
      const a = (args ?? {}) as Args;
      const page = readPage(a.page, 1);
      if (a.search !== undefined && typeof a.search !== 'string' && typeof a.search !== 'number') {
        throw new Error('[BAD_REQUEST] Specify search as text.');
      }
      const search = a.search === undefined ? undefined : String(a.search);
      const answer = await apiRequest<{ pages?: number; results?: MediaItem[] }>(
        'GET',
        '/media',
        ctx,
        { params: { page, search } },
      );
      return {
        files: (Array.isArray(answer?.results) ? answer.results : []).map((file) => ({
          id: file.id,
          url: file.path ?? '',
          name: file.originalName || file.name || '',
          createdAt: file.createdAt ?? null,
        })),
        page,
        pages: answer?.pages ?? 1,
      };
    },
  });
}
