/** JSON Schema fragments shared by several tools. */

import { MAX_PAGE_SIZE, PRIMARY_STATUSES } from './entities.js';

export const advertiserIdSchema = {
  type: ['string', 'number'],
  description:
    'Advertiser id from list-advertisers, as a string: TikTok ids exceed the safe integer range, ' +
    'so pass them inside a JSON object rather than as CLI key:value numbers.',
} as const;

export const idListSchema = (what: string) =>
  ({
    type: 'array',
    items: { type: ['string', 'number'] },
    maxItems: 100,
    description: `Only these ${what} ids (strings, at most 100).`,
  }) as const;

export const listPagingSchema = {
  status: {
    type: 'string',
    enum: [...PRIMARY_STATUSES],
    description:
      'Primary status filter. Default STATUS_NOT_DELETE (everything not deleted). ' +
      'STATUS_DELIVERY_OK: delivering; STATUS_DISABLE: paused; STATUS_NOT_DELIVERY: not delivering.',
  },
  nameContains: { type: 'string', description: 'Only items whose name contains this text.' },
  page: { type: 'integer', minimum: 1, description: 'Page number, from 1. Default 1.' },
  pageSize: {
    type: 'integer',
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    description: `Items per page, 1-${MAX_PAGE_SIZE}. Default 50.`,
  },
} as const;
