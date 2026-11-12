import type { AgentApp } from '@agentapps/sdk';
import { apiRequest, getAppCredentials } from '../lib/client.js';
import { MAX_RESULT_CHARS } from '../lib/entities.js';

interface AdvertiserList {
  list?: Array<{ advertiser_id?: string | number; advertiser_name?: string }>;
}

export function registerListAdvertisersTool(app: AgentApp): void {
  app.tool('list-advertisers', {
    description:
      'List the TikTok ad accounts (advertisers) the access token is authorized for. Returns ' +
      '{ advertisers: [{ advertiserId, name }], count }. Start here: every other tool needs an ' +
      'advertiserId (a long numeric string). Use get-advertiser-info for currency, time zone, ' +
      'status and balance. Needs the TikTok developer app id and secret as system secrets.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const { appId, appSecret } = await getAppCredentials(ctx);
      const data = await apiRequest<AdvertiserList>('GET', '/oauth2/advertiser/get/', ctx, {
        params: { app_id: appId, secret: appSecret },
      });
      const advertisers: Array<{ advertiserId: string; name: string | null }> = [];
      let chars = 0;
      let limitApplied = false;
      for (const a of data.list ?? []) {
        const item = { advertiserId: String(a.advertiser_id), name: a.advertiser_name ?? null };
        chars += JSON.stringify(item).length + 1;
        if (chars > MAX_RESULT_CHARS) {
          limitApplied = true;
          break;
        }
        advertisers.push(item);
      }
      return {
        advertisers,
        count: data.list?.length ?? 0,
        ...(limitApplied ? { limitApplied: true } : {}),
      };
    },
  });
}
