import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { clampInt, isNonEmptyString, shapeSegment } from './_helpers.js';

interface ListSegmentsResponse {
  segments?: unknown[];
  total_items?: number;
}

/**
 * list-segments — GET /lists/{listId}/segments.
 */
export function registerListSegmentsTool(app: AgentApp): void {
  app.tool('list-segments', {
    description:
      'List segments for a Mailchimp audience (GET /lists/{listId}/segments). Returns { segments, total_items, count }. Params: listId (required), count? (1-1000, default 10).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'Id of the audience/list (required).' },
        count: {
          type: 'number',
          description: 'Max segments to return (1-1000, default 10).',
          default: 10,
        },
      },
      required: ['listId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      if (!isNonEmptyString(a.listId)) {
        throw new Error('listId is required and must be a non-empty string.');
      }
      const listId = String(a.listId).trim();
      const count = clampInt(a.count, 1, 1000, 10);

      const res = await mailchimpRequest<ListSegmentsResponse>(
        ctx,
        `/lists/${encodeURIComponent(listId)}/segments`,
        { query: { count } },
      );

      const segments = (res.segments ?? []).map(shapeSegment);
      return {
        segments,
        total_items: typeof res.total_items === 'number' ? res.total_items : segments.length,
        count,
      };
    },
  });
}
