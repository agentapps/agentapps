import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { buildCreateCampaignBody, shapeCampaign, validateCreateCampaignArgs } from './_helpers.js';

/**
 * create-campaign — POST /campaigns.
 *
 * Creates a new campaign. The type is required ("regular", "plaintext",
 * "absplit", "rss", "variate"). recipients and settings are optional at
 * creation but needed before sending.
 */
export function registerCreateCampaignTool(app: AgentApp): void {
  app.tool('create-campaign', {
    description:
      'Create a campaign in Mailchimp (POST /campaigns). Returns the created campaign. Params: type (required, "regular"|"plaintext"|"absplit"|"rss"|"variate"), recipients? ({ list_id }), settings? ({ subject_line?, from_name?, reply_to?, ... }).',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Campaign type (required).',
          enum: ['regular', 'plaintext', 'absplit', 'rss', 'variate'],
        },
        recipients: {
          type: 'object',
          description: 'Recipients — { list_id } targeting an audience.',
          properties: {
            list_id: { type: 'string', description: 'Audience/list id to send to.' },
          },
        },
        settings: {
          type: 'object',
          description: 'Campaign settings (subject_line, from_name, reply_to, etc.).',
          properties: {
            subject_line: { type: 'string', description: 'Subject line of the campaign.' },
            from_name: { type: 'string', description: 'Sender name.' },
            reply_to: { type: 'string', description: 'Reply-to email address.' },
          },
        },
      },
      required: ['type'],
    },
    // Creates the campaign as a draft; nothing is sent until send-campaign.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      validateCreateCampaignArgs(args);
      const body = buildCreateCampaignBody(args as Record<string, unknown>);

      const res = await mailchimpRequest<unknown>(ctx, '/campaigns', {
        method: 'POST',
        body,
      });

      return shapeCampaign(res);
    },
  });
}
