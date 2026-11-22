import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * list-webhook-subscriptions — GET /webhook_subscriptions
 *
 * Lists webhook subscriptions for the organization.
 */
export function registerListWebhookSubscriptionsTool(app: AgentApp): void {
  app.tool('list-webhook-subscriptions', {
    description:
      'List Calendly webhook subscriptions for the organization (GET /webhook_subscriptions). Requires organizationUri. Returns webhook subscriptions with URL, events, state, etc.',
    parameters: {
      type: 'object',
      properties: {
        organizationUri: {
          type: 'string',
          description:
            'The Calendly organization URI (e.g. "https://api.calendly.com/organizations/AAAA"). Get this from get-current-user → current_organization.',
        },
        count: {
          type: 'number',
          description: 'Number of results to return (default 20, max 100).',
        },
      },
      required: ['organizationUri'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const params: Record<string, string | number | boolean | undefined> = {
        organization: String(a.organizationUri),
        scope: 'organization',
      };
      if (a.count !== undefined) params.count = Number(a.count);

      const data = (await calendlyRequest('GET', '/webhook_subscriptions', params, ctx)) as {
        collection: unknown[];
        pagination: unknown;
      };
      return {
        count: data.collection.length,
        webhookSubscriptions: data.collection,
        pagination: data.pagination,
      };
    },
  });
}
