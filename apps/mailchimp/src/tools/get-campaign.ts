import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { shapeCampaign } from './_helpers.js';

/**
 * get-campaign — GET /campaigns/{campaignId}.
 *
 * Detail of a single campaign (type, status, recipients, settings).
 */
export function registerGetCampaignTool(app: AgentApp): void {
  app.tool('get-campaign', {
    description:
      'Get one campaign by id from Mailchimp (GET /campaigns/{campaignId}). Returns campaign details. Params: campaignId (required, string).',
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
      if (!a.campaignId || typeof a.campaignId !== 'string' || a.campaignId.trim() === '') {
        throw new Error('campaignId is required and must be a non-empty string.');
      }
      const campaignId = String(a.campaignId).trim();

      const res = await mailchimpRequest<unknown>(
        ctx,
        `/campaigns/${encodeURIComponent(campaignId)}`,
      );
      return shapeCampaign(res);
    },
  });
}
