import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { clampInt, isNonEmptyString, shapeMergeField } from './_helpers.js';

interface ListMergeFieldsResponse {
  merge_fields?: unknown[];
  total_items?: number;
}

/**
 * list-merge-fields — GET /lists/{listId}/merge-fields.
 */
export function registerListMergeFieldsTool(app: AgentApp): void {
  app.tool('list-merge-fields', {
    description:
      'List merge fields for a Mailchimp audience (GET /lists/{listId}/merge-fields). Returns { merge_fields, total_items, count }. Params: listId (required), count? (1-1000, default 10).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'Id of the audience/list (required).' },
        count: {
          type: 'number',
          description: 'Max merge fields to return (1-1000, default 10).',
          default: 10,
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
      const count = clampInt(a.count, 1, 1000, 10);

      const res = await mailchimpRequest<ListMergeFieldsResponse>(
        ctx,
        `/lists/${encodeURIComponent(listId)}/merge-fields`,
        { query: { count } },
      );

      const merge_fields = (res.merge_fields ?? []).map(shapeMergeField);
      return {
        merge_fields,
        total_items: typeof res.total_items === 'number' ? res.total_items : merge_fields.length,
        count,
      };
    },
  });
}
