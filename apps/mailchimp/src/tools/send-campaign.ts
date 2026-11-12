import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { isNonEmptyString } from './_helpers.js';

/**
 * send-campaign — POST /campaigns/{campaignId}/actions/send.
 *
 * Sends a campaign. The campaign must be in a ready-to-send state (checklist
 * complete, recipients + settings configured). Returns 204 on success.
 */
export function registerSendCampaignTool(app: AgentApp): void {
  app.tool('send-campaign', {
    description:
      'Send a campaign in Mailchimp (POST /campaigns/{campaignId}/actions/send). The campaign must be ready to send. Returns { sent: true }. Params: campaignId (required, string).',
    parameters: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'Id of the campaign to send (required).' },
      },
      required: ['campaignId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      if (!isNonEmptyString(a.campaignId)) {
        throw new Error('campaignId is required and must be a non-empty string.');
      }
      const campaignId = String(a.campaignId).trim();

      await mailchimpRequest(ctx, `/campaigns/${encodeURIComponent(campaignId)}/actions/send`, {
        method: 'POST',
      });

      return { sent: true };
    },
  });
}
