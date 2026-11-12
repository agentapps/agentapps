import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { clampInt, shapeCampaign } from './_helpers.js';

interface ListCampaignsResponse {
  campaigns?: unknown[];
  total_items?: number;
}

/**
 * list-campaigns — GET /campaigns.
 */
export function registerListCampaignsTool(app: AgentApp): void {
  app.tool('list-campaigns', {
    description:
      'List campaigns from Mailchimp (GET /campaigns). Returns { campaigns, total_items, count }. Params: count? (1-1000, default 10).',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Max campaigns to return (1-1000, default 10).',
          default: 10,
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
      const count = clampInt(a.count, 1, 1000, 10);

      const res = await mailchimpRequest<ListCampaignsResponse>(ctx, '/campaigns', {
        query: { count },
      });

      const campaigns = (res.campaigns ?? []).map(shapeCampaign);
      return {
        campaigns,
        total_items: typeof res.total_items === 'number' ? res.total_items : campaigns.length,
        count,
      };
    },
  });
}
