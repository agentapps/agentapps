import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { isNonEmptyString, shapeCampaignReport } from './_helpers.js';

/**
 * get-campaign-report — GET /reports/{campaignId}.
 *
 * Returns performance report for a sent campaign: opens, clicks, bounces, etc.
 */
export function registerGetCampaignReportTool(app: AgentApp): void {
  app.tool('get-campaign-report', {
    description:
      'Get a campaign report from Mailchimp (GET /reports/{campaignId}). Returns performance data including opens, clicks, bounces, unsubscribes. Params: campaignId (required, string).',
    parameters: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'Id of the campaign (required).' },
      },
      required: ['campaignId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      if (!isNonEmptyString(a.campaignId)) {
        throw new Error('campaignId is required and must be a non-empty string.');
      }
      const campaignId = String(a.campaignId).trim();

      const res = await mailchimpRequest<unknown>(
        ctx,
        `/reports/${encodeURIComponent(campaignId)}`,
      );
      return shapeCampaignReport(res);
    },
  });
}
