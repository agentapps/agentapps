/**
 * Mock bodies in the shapes the Graph API really returns, with synthetic values: ids are
 * strings (campaign, ad set and ad ids have 15-18 digits), account_status is a number,
 * money and every insights metric are strings, and pages carry cursors plus a `next` URL
 * only when there is another page.
 */

export const ACCOUNT_ID = 'act_1234567890123';
/** 18 digits: above Number.MAX_SAFE_INTEGER, like real campaign ids. */
export const CAMPAIGN_ID = '120210000000000001';
export const AD_SET_ID = '120210000000000002';
export const AD_ID = '120210000000000003';

export function page<T>(data: T[], after?: string) {
  return {
    data,
    paging: {
      cursors: { before: 'QVFIUmJlZAm9yZAQZDZD', after: after ?? 'QVFIUmFmdGVyZAQZDZD' },
      ...(after
        ? { next: `https://graph.facebook.com/v26.0/act_1234567890123/campaigns?after=${after}` }
        : {}),
    },
  };
}

export function graphError(code: number, message: string, extra: Record<string, unknown> = {}) {
  return {
    error: {
      message,
      type: 'OAuthException',
      code,
      fbtrace_id: 'AbCdEfGhIjKlMnOp',
      ...extra,
    },
  };
}

export const adAccount = {
  id: ACCOUNT_ID,
  account_id: '1234567890123',
  name: 'Acme Shop & Co',
  account_status: 1,
  currency: 'EUR',
  timezone_name: 'Europe/Madrid',
  amount_spent: '1234567',
  spend_cap: '0',
  business: { id: '987654321098765', name: 'Acme Business' },
};

export const campaign = {
  id: CAMPAIGN_ID,
  name: 'Autumn sale',
  objective: 'OUTCOME_SALES',
  status: 'ACTIVE',
  effective_status: 'ACTIVE',
  daily_budget: '5000',
  budget_remaining: '3120',
  bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  special_ad_categories: [],
  start_time: '2026-09-01T10:00:00+0200',
  updated_time: '2026-10-01T09:30:00+0200',
};

export const adSet = {
  id: AD_SET_ID,
  name: 'Spain 25-44',
  campaign_id: CAMPAIGN_ID,
  status: 'ACTIVE',
  effective_status: 'CAMPAIGN_PAUSED',
  daily_budget: '0',
  lifetime_budget: '0',
  budget_remaining: '0',
  optimization_goal: 'OFFSITE_CONVERSIONS',
  billing_event: 'IMPRESSIONS',
  start_time: '2026-09-01T10:00:00+0200',
  targeting: { geo_locations: { countries: ['ES'] }, age_min: 25, age_max: 44 },
};

export const ad = {
  id: AD_ID,
  name: 'Carousel A',
  adset_id: AD_SET_ID,
  campaign_id: CAMPAIGN_ID,
  status: 'ACTIVE',
  effective_status: 'WITH_ISSUES',
  updated_time: '2026-10-02T11:00:00+0200',
  creative: {
    id: '120210000000000004',
    name: 'Carousel creative',
    title: 'Autumn sale',
    body: '30% off this week',
    thumbnail_url: 'https://scontent.example.fbcdn.net/thumb.jpg',
    call_to_action_type: 'SHOP_NOW',
  },
  issues_info: [
    {
      error_code: 1815869,
      error_message: 'Ad creative image is too small',
      error_summary: 'Image too small',
      error_type: 'SOFT_ERROR',
      level: 'AD',
    },
  ],
};

export const creative = {
  id: '120210000000000004',
  name: 'Carousel creative',
  status: 'ACTIVE',
  title: 'Autumn sale',
  body: '30% off this week',
  object_type: 'SHARE',
  thumbnail_url: 'https://scontent.example.fbcdn.net/thumb.jpg',
  call_to_action_type: 'SHOP_NOW',
  effective_object_story_id: '111222333444555_666777888999000',
};

export const insightsRow = {
  campaign_id: CAMPAIGN_ID,
  campaign_name: 'Autumn sale',
  spend: '53.39',
  impressions: '36132',
  reach: '20011',
  frequency: '1.805607',
  clicks: '734',
  ctr: '2.031440',
  cpc: '0.072738',
  cpm: '1.477637',
  account_currency: 'EUR',
  date_start: '2026-09-17',
  date_stop: '2026-10-16',
};
