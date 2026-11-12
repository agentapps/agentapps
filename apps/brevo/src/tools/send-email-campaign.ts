import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import { coerceInt } from './_helpers.js';

/**
 * send-email-campaign — POST /emailCampaigns/{campaignId}/sendNow.
 *
 * Sends the campaign to ALL its recipients immediately. IRREVERSIBLE — there is
 * no undo. The campaign must be a draft with recipients already set (via
 * create-email-campaign).
 */
export function registerSendEmailCampaignTool(app: AgentApp): void {
  app.tool('send-email-campaign', {
    description:
      'Send an email campaign immediately (POST /emailCampaigns/{campaignId}/sendNow). IRREVERSIBLE — delivers to every recipient with no undo. The campaign must be a draft with recipients set. Returns { campaignId, sent }. Params: campaignId (required, integer).',
    parameters: {
      type: 'object',
      properties: {
        campaignId: { type: 'number', description: 'Id of the campaign to send now (required).' },
      },
      required: ['campaignId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      const id = coerceInt((args as Record<string, unknown>)?.campaignId);
      if (id == null) throw new Error('campaignId is required and must be an integer.');

      await brevoRequest<unknown>(ctx, `/emailCampaigns/${id}/sendNow`, { method: 'POST' });
      return { campaignId: id, sent: true };
    },
  });
}
