import type { AgentApp } from '@agentapps/sdk';
import { asArgs, readAccountId, readId, readInt, readString } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { compact, type GraphPage, listResult } from '../lib/results.js';
import { readStatuses, STATUSES_PARAMETER } from '../lib/status.js';
import { READ_ONLY } from './annotations.js';

interface RawAd {
  id: string;
  name?: string;
  adset_id?: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  creative?: {
    id: string;
    name?: string;
    title?: string;
    body?: string;
    thumbnail_url?: string;
    call_to_action_type?: string;
  };
  issues_info?: { error_message?: string; error_summary?: string; level?: string }[];
  updated_time?: string;
}

export function registerListAdsTool(app: AgentApp): void {
  app.tool('list-ads', {
    description:
      'List ads of one ad set (adSetId), one campaign (campaignId) or a whole ad account (accountId); the most specific one given wins. Returns items with id, name, adSetId, campaignId, status, effectiveStatus, updatedTime, its creative (id, name, title, body, thumbnailUrl, callToAction) and delivery issues when Meta reports any. Max 100 per page; page with `after`.',
    parameters: {
      type: 'object',
      properties: {
        adSetId: {
          type: ['string', 'number'],
          description: 'Ad set id (digits; pass as a string, ids have up to 18 digits).',
        },
        campaignId: { type: ['string', 'number'], description: 'Campaign id (digits).' },
        accountId: { type: ['string', 'number'], description: 'Ad account id (act_<digits>).' },
        statuses: STATUSES_PARAMETER,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Ads per page (default 50, max 100).',
        },
        after: { type: 'string', description: 'The nextCursor from a previous call.' },
      },
    },
    annotations: READ_ONLY,
    handler: async (args, ctx) => {
      const a = asArgs(args);
      const parent =
        readId(a, 'adSetId') ?? readId(a, 'campaignId') ?? readAccountId(a, 'accountId', false);
      if (!parent) {
        throw new Error('[BAD_REQUEST] Give adSetId, campaignId or accountId.');
      }
      const page = await apiRequest<GraphPage<RawAd>>('GET', `/${parent}/ads`, ctx, {
        params: {
          fields: [
            'id',
            'name',
            'adset_id',
            'campaign_id',
            'status',
            'effective_status',
            'updated_time',
            'creative{id,name,title,body,thumbnail_url,call_to_action_type}',
            'issues_info',
          ],
          effective_status: readStatuses(a),
          limit: readInt(a, 'limit', { min: 1, max: 100, fallback: 50 }),
          after: readString(a, 'after', { max: 500 }),
        },
      });
      const items = (page.data ?? []).map((ad) =>
        compact({
          id: ad.id,
          name: ad.name,
          adSetId: ad.adset_id,
          campaignId: ad.campaign_id,
          status: ad.status,
          effectiveStatus: ad.effective_status,
          updatedTime: ad.updated_time,
          creative: ad.creative
            ? compact({
                id: ad.creative.id,
                name: ad.creative.name,
                title: ad.creative.title,
                body: ad.creative.body,
                thumbnailUrl: ad.creative.thumbnail_url,
                callToAction: ad.creative.call_to_action_type,
              })
            : undefined,
          issues:
            ad.issues_info && ad.issues_info.length > 0
              ? ad.issues_info.map((i) => i.error_summary ?? i.error_message ?? 'unknown issue')
              : undefined,
        }),
      );
      return listResult(page, items);
    },
  });
}
