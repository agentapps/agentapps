import type { AgentApp } from '@agentapps/sdk';
import { type Args, parseIdList } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';

type Raw = Record<string, unknown>;

const MAX_IDS = 100;
const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v));

export function registerGetAdvertiserInfoTool(app: AgentApp): void {
  app.tool('get-advertiser-info', {
    description:
      'Get details of up to 100 TikTok ad accounts. Returns { advertisers: [{ advertiserId, ' +
      'name, status, currency, timezone, displayTimezone, balance, company, country, role, ' +
      'createTime }] }. Budgets and report spend are in the account currency; report dates ' +
      'follow the account time zone.',
    parameters: {
      type: 'object',
      properties: {
        advertiserIds: {
          type: 'array',
          items: { type: ['string', 'number'] },
          minItems: 1,
          maxItems: MAX_IDS,
          description:
            'Advertiser ids from list-advertisers, as strings (they exceed the safe integer range).',
        },
      },
      required: ['advertiserIds'],
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
      const ids = parseIdList(a.advertiserIds, 'advertiserIds', MAX_IDS);
      const data = await apiRequest<{ list?: Raw[] }>('GET', '/advertiser/info/', ctx, {
        params: { advertiser_ids: ids },
      });
      return {
        advertisers: (data.list ?? []).map((r) => ({
          advertiserId: str(r.advertiser_id),
          name: str(r.name),
          status: str(r.status),
          currency: str(r.currency),
          timezone: str(r.timezone),
          displayTimezone: str(r.display_timezone),
          balance:
            typeof r.balance === 'number'
              ? r.balance
              : r.balance == null
                ? null
                : Number(r.balance),
          company: str(r.company),
          country: str(r.country),
          role: str(r.role),
          createTime: r.create_time ?? null,
        })),
      };
    },
  });
}
