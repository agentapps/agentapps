import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import { buildSendTestBody, coerceInt, validateSendTestArgs } from './_helpers.js';

/**
 * send-test-email — POST /emailCampaigns/{campaignId}/sendTest.
 *
 * Sends a REAL test email of the campaign to the given addresses (<=99). It puts
 * mail on the wire with no undo, so it carries `destructiveHint` like
 * send-transactional-email.
 */
export function registerSendTestEmailTool(app: AgentApp): void {
  app.tool('send-test-email', {
    description:
      'Send a test of an email campaign to specific addresses (POST /emailCampaigns/{campaignId}/sendTest). Delivers REAL emails to the given testers. Returns { campaignId, emailTo }. Params: campaignId (required, integer), emailTo (required, array of up to 99 email addresses).',
    parameters: {
      type: 'object',
      properties: {
        campaignId: { type: 'number', description: 'Id of the campaign to test (required).' },
        emailTo: {
          type: 'array',
          description: 'Recipients of the test (1-99 email addresses).',
          items: { type: 'string' },
        },
      },
      required: ['campaignId', 'emailTo'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      validateSendTestArgs(args);
      const a = args as Record<string, unknown>;
      const id = coerceInt(a.campaignId) as number;
      const body = buildSendTestBody(a);

      await brevoRequest<unknown>(ctx, `/emailCampaigns/${id}/sendTest`, {
        method: 'POST',
        body,
      });
      return { campaignId: id, emailTo: body.emailTo };
    },
  });
}
