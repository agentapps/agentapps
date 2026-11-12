/**
 * Shared logic for pause-delivery and enable-delivery: the three `/<level>/status/update/`
 * endpoints. DELETE is deliberately not offered (irreversible).
 */

import { type Args, parseEnum, parseId, parseIdList } from './args.js';
import { apiRequest, type ClientContext } from './client.js';
import type { Level } from './entities.js';

export const LEVELS = ['campaign', 'adgroup', 'ad'] as const;
/** Kept low so one approval never covers a large blast radius. */
export const MAX_STATUS_IDS = 20;

const IDS_KEY: Record<Level, string> = {
  campaign: 'campaign_ids',
  adgroup: 'adgroup_ids',
  ad: 'ad_ids',
};

export const statusParameters = (verb: string) => ({
  type: 'object' as const,
  properties: {
    advertiserId: {
      type: ['string', 'number'],
      description: 'Advertiser id from list-advertisers, as a string.',
    },
    level: {
      type: 'string',
      enum: [...LEVELS],
      description: 'What the ids are: campaign, adgroup or ad.',
    },
    ids: {
      type: 'array',
      items: { type: ['string', 'number'] },
      minItems: 1,
      maxItems: MAX_STATUS_IDS,
      description: `Ids to ${verb}, as strings, at most ${MAX_STATUS_IDS}, all of the given level.`,
    },
  },
  required: ['advertiserId', 'level', 'ids'],
});

export async function updateStatus(
  ctx: ClientContext,
  args: Args,
  operationStatus: 'ENABLE' | 'DISABLE',
): Promise<Record<string, unknown>> {
  const advertiserId = parseId(args.advertiserId, 'advertiserId');
  const level = parseEnum(args.level, 'level', LEVELS);
  const ids = parseIdList(args.ids, 'ids', MAX_STATUS_IDS);
  const key = IDS_KEY[level];
  const data = await apiRequest<Record<string, unknown>>('POST', `/${level}/status/update/`, ctx, {
    body: { advertiser_id: advertiserId, [key]: ids, operation_status: operationStatus },
  });
  const returned = Array.isArray(data[key]) ? (data[key] as unknown[]).map(String) : ids;
  return {
    success: true,
    level,
    operationStatus,
    updatedIds: returned,
    ...(returned.length < ids.length
      ? { notUpdatedIds: ids.filter((id) => !returned.includes(id)) }
      : {}),
  };
}
