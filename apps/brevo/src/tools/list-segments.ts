import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import { clampInt, shapeSegment, validateEnum } from './_helpers.js';

interface ListSegmentsResponse {
  segments?: unknown[];
  count?: number;
}

const SEGMENT_SORT = ['asc', 'desc'] as const;

/**
 * list-segments — GET /contacts/segments.
 *
 * Segments are saved contact filters. They can be used as `recipients.segmentIds`
 * when creating a campaign, so listing them lets the agent target a segment by id.
 */
export function registerListSegmentsTool(app: AgentApp): void {
  app.tool('list-segments', {
    description:
      'List the contact segments (saved filters) in the Brevo account (GET /contacts/segments). Their ids can be used as recipients.segmentIds in create-email-campaign. Returns { segments:[{id,segmentName,categoryName,updatedAt}], count, limit, offset, sort }. Params: limit? (1-50, default 10), offset? (default 0), sort? (asc | desc — by creation date, default desc).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max segments to return (1-50, default 10).',
          default: 10,
        },
        offset: {
          type: 'number',
          description: 'Index of the first segment for pagination (default 0).',
          default: 0,
        },
        sort: {
          type: 'string',
          description: 'Sort by record creation: asc or desc (default desc).',
          enum: ['asc', 'desc'],
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
      const limit = clampInt(a.limit, 1, 50, 10);
      const offset = clampInt(a.offset, 0, Number.MAX_SAFE_INTEGER, 0);
      const sort = validateEnum(a.sort, SEGMENT_SORT, 'sort');

      const res = await brevoRequest<ListSegmentsResponse>(ctx, '/contacts/segments', {
        query: { limit, offset, sort },
      });

      const segments = (res.segments ?? []).map(shapeSegment);
      return {
        segments,
        count: typeof res.count === 'number' ? res.count : segments.length,
        limit,
        offset,
        sort: sort ?? null,
      };
    },
  });
}
