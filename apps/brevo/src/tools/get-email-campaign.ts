import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import { coerceInt, shapeCampaign } from './_helpers.js';

/**
 * get-email-campaign — GET /emailCampaigns/{campaignId}.
 *
 * Detail of a single campaign (status, schedule, subject). Useful right after
 * create-email-campaign to confirm the draft before sending.
 */
export function registerGetEmailCampaignTool(app: AgentApp): void {
  app.tool('get-email-campaign', {
    description:
      'Get one email campaign by id from Brevo (GET /emailCampaigns/{campaignId}). Returns { id, name, subject, type, status, scheduledAt, createdAt, modifiedAt }. Params: campaignId (required, integer).',
    parameters: {
      type: 'object',
      properties: {
        campaignId: { type: 'number', description: 'Id of the campaign (required).' },
      },
      required: ['campaignId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const id = coerceInt((args as Record<string, unknown>)?.campaignId);
      if (id == null) throw new Error('campaignId is required and must be an integer.');

      const res = await brevoRequest<unknown>(ctx, `/emailCampaigns/${id}`);
      return shapeCampaign(res);
    },
  });
}
