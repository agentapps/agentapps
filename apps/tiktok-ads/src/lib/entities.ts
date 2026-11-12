/**
 * Shared listing logic for campaigns, ad groups and ads: the three `/<level>/get/`
 * endpoints take the same `advertiser_id`, `filtering`, `page` and `page_size` and answer
 * `{ list, page_info }`.
 */

import {
  type Args,
  parseEnum,
  parseId,
  parseInteger,
  parseOptionalIdList,
  parseOptionalString,
} from './args.js';
import { apiRequest, type ClientContext } from './client.js';

export type Level = 'campaign' | 'adgroup' | 'ad';

export const PRIMARY_STATUSES = [
  'STATUS_NOT_DELETE',
  'STATUS_ALL',
  'STATUS_DELIVERY_OK',
  'STATUS_NOT_DELIVERY',
  'STATUS_DISABLE',
  'STATUS_DELETE',
] as const;

export const MAX_PAGE_SIZE = 100;
/** Stop adding items before the SDK's 50,000-character result limit. */
export const MAX_RESULT_CHARS = 45_000;
const MAX_FILTER_IDS = 100;

type Raw = Record<string, unknown>;

export interface PageInfo {
  page?: number;
  page_size?: number;
  total_number?: number;
  total_page?: number;
}

interface ListData {
  list?: Raw[];
  page_info?: PageInfo;
}

const num = (v: unknown) =>
  typeof v === 'number'
    ? v
    : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))
      ? Number(v)
      : null;
const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v));

const CURATE: Record<Level, (r: Raw) => Raw> = {
  campaign: (r) => ({
    campaignId: str(r.campaign_id),
    name: str(r.campaign_name),
    objectiveType: str(r.objective_type),
    operationStatus: str(r.operation_status),
    secondaryStatus: str(r.secondary_status),
    budget: num(r.budget),
    budgetMode: str(r.budget_mode),
    createTime: str(r.create_time),
    modifyTime: str(r.modify_time),
  }),
  adgroup: (r) => ({
    adgroupId: str(r.adgroup_id),
    name: str(r.adgroup_name),
    campaignId: str(r.campaign_id),
    operationStatus: str(r.operation_status),
    secondaryStatus: str(r.secondary_status),
    budget: num(r.budget),
    budgetMode: str(r.budget_mode),
    optimizationGoal: str(r.optimization_goal),
    bidType: str(r.bid_type),
    bidPrice: num(r.bid_price),
    billingEvent: str(r.billing_event),
    scheduleStartTime: str(r.schedule_start_time),
    scheduleEndTime: str(r.schedule_end_time),
    createTime: str(r.create_time),
    modifyTime: str(r.modify_time),
  }),
  ad: (r) => ({
    adId: str(r.ad_id),
    name: str(r.ad_name),
    adgroupId: str(r.adgroup_id),
    campaignId: str(r.campaign_id),
    operationStatus: str(r.operation_status),
    secondaryStatus: str(r.secondary_status),
    adFormat: str(r.ad_format),
    adText: str(r.ad_text),
    landingPageUrl: str(r.landing_page_url),
    createTime: str(r.create_time),
    modifyTime: str(r.modify_time),
  }),
};

const PLURAL: Record<Level, string> = { campaign: 'campaigns', adgroup: 'adGroups', ad: 'ads' };

/** Filters each level accepts: argument name -> TikTok filtering key. */
const ID_FILTERS: Record<Level, Array<[string, string]>> = {
  campaign: [['campaignIds', 'campaign_ids']],
  adgroup: [
    ['campaignIds', 'campaign_ids'],
    ['adgroupIds', 'adgroup_ids'],
  ],
  ad: [
    ['campaignIds', 'campaign_ids'],
    ['adgroupIds', 'adgroup_ids'],
    ['adIds', 'ad_ids'],
  ],
};
const NAME_FILTER: Record<Level, string> = {
  campaign: 'campaign_name',
  adgroup: 'adgroup_name',
  ad: 'ad_name',
};

/** Fetches one page of raw items; used by the list tools and by update-budget's pre-read. */
export async function getPage(
  ctx: ClientContext,
  level: Level,
  advertiserId: string,
  filtering: Raw,
  page: number,
  pageSize: number,
): Promise<ListData> {
  return apiRequest<ListData>('GET', `/${level}/get/`, ctx, {
    params: {
      advertiser_id: advertiserId,
      filtering: Object.keys(filtering).length > 0 ? filtering : undefined,
      page,
      page_size: pageSize,
    },
  });
}

/** The list tools: validate, request one page, curate, keep the result under the limit. */
export async function listEntities(ctx: ClientContext, level: Level, args: Args): Promise<Raw> {
  const advertiserId = parseId(args.advertiserId, 'advertiserId');
  const filtering: Raw = {};
  for (const [arg, key] of ID_FILTERS[level]) {
    const ids = parseOptionalIdList(args[arg], arg, MAX_FILTER_IDS);
    if (ids) filtering[key] = ids;
  }
  const name = parseOptionalString(args.nameContains, 'nameContains');
  if (name) filtering[NAME_FILTER[level]] = name;
  filtering.primary_status = parseEnum(
    args.status,
    'status',
    PRIMARY_STATUSES,
    'STATUS_NOT_DELETE',
  );
  const page = parseInteger(args.page, 'page', 1, 100_000, 1);
  const pageSize = parseInteger(args.pageSize, 'pageSize', 1, MAX_PAGE_SIZE, 50);

  const data = await getPage(ctx, level, advertiserId, filtering, page, pageSize);
  const items: Raw[] = [];
  let chars = 0;
  let limitApplied = false;
  for (const raw of data.list ?? []) {
    const item = CURATE[level](raw);
    chars += JSON.stringify(item).length + 1;
    if (chars > MAX_RESULT_CHARS) {
      limitApplied = true;
      break;
    }
    items.push(item);
  }
  const info = data.page_info ?? {};
  const totalPage = info.total_page ?? 0;
  return {
    [PLURAL[level]]: items,
    page: info.page ?? page,
    pageSize: info.page_size ?? pageSize,
    totalNumber: info.total_number ?? items.length,
    totalPage,
    hasMore: (info.page ?? page) < totalPage,
    ...(limitApplied
      ? {
          limitApplied: true,
          note: `Only the first ${items.length} items fit in the result; re-run with pageSize ${items.length} or less to page through all of them.`,
        }
      : {}),
  };
}
