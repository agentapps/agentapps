import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * delete-webhook-subscription — DELETE /webhook_subscriptions/{uuid}
 *
 * Deletes a webhook subscription.
 */
export function registerDeleteWebhookSubscriptionTool(app: AgentApp): void {
  app.tool('delete-webhook-subscription', {
    description:
      'Delete a Calendly webhook subscription by UUID (DELETE /webhook_subscriptions/{uuid}). This action cannot be undone.',
    parameters: {
      type: 'object',
      properties: {
        webhookId: {
          type: 'string',
          description: 'The webhook subscription UUID to delete.',
        },
      },
      required: ['webhookId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const data = await calendlyRequest(
        'DELETE',
        `/webhook_subscriptions/${a.webhookId}`,
        undefined,
        ctx,
      );
      return { webhookId: a.webhookId, deleted: true, result: data };
    },
  });
}
