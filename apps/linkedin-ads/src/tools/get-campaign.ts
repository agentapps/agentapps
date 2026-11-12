import type { AgentApp } from '@agentapps/sdk';
import { type Args, ensureSize, isoTime, numericId } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { shapeCampaign } from '../lib/shape.js';

export function registerGetCampaignTool(app: AgentApp): void {
  app.tool('get-campaign', {
    description:
      'Get one LinkedIn campaign with its settings and targeting. Returns the fields of ' +
      'list-campaigns plus targetingCriteria (LinkedIn include/exclude facets with URNs), ' +
      'locale, audienceExpansionEnabled, offsiteDeliveryEnabled, creativeSelection, ' +
      'pacingStrategy, createdAt and lastModifiedAt.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: ['string', 'number'],
          description: 'Ad account id from list-ad-accounts.',
        },
        campaignId: {
          type: ['string', 'number'],
          description:
            'Campaign id from list-campaigns (digits, or urn:li:sponsoredCampaign:<id>).',
        },
      },
      required: ['accountId', 'campaignId'],
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
      const accountId = numericId(a.accountId, 'accountId', 'sponsoredAccount');
      const campaignId = numericId(a.campaignId, 'campaignId', 'sponsoredCampaign');
      const c = await apiRequest<Record<string, unknown>>(
        'GET',
        `/adAccounts/${accountId}/adCampaigns/${campaignId}`,
        ctx,
        { scope: 'r_ads' },
      );
      const audit = (c.changeAuditStamps ?? {}) as Record<string, { time?: unknown } | undefined>;
      return ensureSize(
        {
          ...shapeCampaign(c),
          locale: c.locale ?? null,
          targetingCriteria: c.targetingCriteria ?? null,
          audienceExpansionEnabled: c.audienceExpansionEnabled ?? null,
          offsiteDeliveryEnabled: c.offsiteDeliveryEnabled ?? null,
          creativeSelection: c.creativeSelection ?? null,
          pacingStrategy: c.pacingStrategy ?? null,
          createdAt: isoTime(audit.created?.time),
          lastModifiedAt: isoTime(audit.lastModified?.time),
        },
        'This campaign has unusually large targeting; read it in Campaign Manager instead.',
      );
    },
  });
}
