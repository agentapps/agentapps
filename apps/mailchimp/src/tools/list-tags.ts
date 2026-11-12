import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { isNonEmptyString, shapeTag } from './_helpers.js';

interface ListTagsResponse {
  tags?: unknown[];
  total_items?: number;
}

/**
 * list-tags — GET /lists/{listId}/tag-search.
 *
 * Searches tags for an audience by name prefix.
 */
export function registerListTagsTool(app: AgentApp): void {
  app.tool('list-tags', {
    description:
      'Search tags for a Mailchimp audience by name prefix (GET /lists/{listId}/tag-search). Returns { tags, total_items }. Params: listId (required), name? (prefix to filter, default "").',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'Id of the audience/list (required).' },
        name: {
          type: 'string',
          description: 'Tag name prefix to search for (default: "" returns all).',
          default: '',
        },
      },
      required: ['listId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      if (!isNonEmptyString(a.listId)) {
        throw new Error('listId is required and must be a non-empty string.');
      }
      const listId = String(a.listId).trim();
      const name = typeof a.name === 'string' ? a.name.trim() : '';

      const res = await mailchimpRequest<ListTagsResponse>(
        ctx,
        `/lists/${encodeURIComponent(listId)}/tag-search`,
        { query: { name } },
      );

      const tags = (res.tags ?? []).map(shapeTag);
      return {
        tags,
        total_items: typeof res.total_items === 'number' ? res.total_items : tags.length,
      };
    },
  });
}
