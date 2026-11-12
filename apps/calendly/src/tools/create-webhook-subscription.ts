import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * create-webhook-subscription — POST /webhook_subscriptions
 *
 * Creates a webhook subscription for the organization.
 */
export function registerCreateWebhookSubscriptionTool(app: AgentApp): void {
  app.tool('create-webhook-subscription', {
    description:
      'Create a Calendly webhook subscription (POST /webhook_subscriptions). Provide the callback URL, events to subscribe to, organization URI, and scope. Common events: "invitee.created", "invitee.canceled", "invitee_no_show.created", "invitee_no_show.deleted".',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL where Calendly will send webhook notifications.',
        },
        events: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of events to subscribe to (e.g. ["invitee.created", "invitee.canceled"]).',
        },
        organizationUri: {
          type: 'string',
          description:
            'The Calendly organization URI (e.g. "https://api.calendly.com/organizations/AAAA"). Get this from get-current-user → current_organization.',
        },
        scope: {
          type: 'string',
          description: 'Scope of the webhook: "organization" or "user" (default "organization").',
          enum: ['organization', 'user'],
        },
        signingKey: {
          type: 'string',
          description: 'Optional signing key for verifying webhook payloads.',
        },
      },
      required: ['url', 'events', 'organizationUri'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const body: Record<string, unknown> = {
        url: String(a.url),
        events: a.events,
        organization: String(a.organizationUri),
        scope: a.scope ? String(a.scope) : 'organization',
      };
      if (a.signingKey) body.signing_key = String(a.signingKey);

      const data = (await calendlyRequest(
        'POST',
        '/webhook_subscriptions',
        body as Record<string, string | number | boolean | undefined>,
        ctx,
      )) as { resource: Record<string, unknown> };
      return { webhookSubscription: data.resource };
    },
  });
}
