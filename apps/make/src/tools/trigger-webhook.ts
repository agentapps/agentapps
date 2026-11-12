import type { AgentApp } from '@agentapps/sdk';
import { triggerWebhook } from '../lib/make-client.js';

/**
 * trigger-webhook — the primary Make.com tool. POSTs a JSON payload to a Make
 * webhook URL. No account token needed; the user supplies their own webhook URL.
 * The host is validated (`*.make.com`) inside `triggerWebhook` (SSRF guard).
 */
export function registerTriggerWebhookTool(app: AgentApp): void {
  app.tool('trigger-webhook', {
    description:
      'Trigger a Make.com scenario by POSTing a JSON payload to its webhook URL. No account token required — the user supplies the webhook URL (https://hook.<region>.make.com/<token>). Returns { delivered, statusCode, webhookHost, region, responseType, response }.',
    parameters: {
      type: 'object',
      properties: {
        webhookUrl: {
          type: 'string',
          description:
            'The Make.com webhook URL (https://hook.<region>.make.com/<token>). Only *.make.com hosts over https are accepted.',
        },
        payload: {
          oneOf: [{ type: 'object', additionalProperties: true }, { type: 'string' }],
          description:
            'Body sent to the webhook. A JSON object is sent as application/json; a string is forwarded as-is (JSON string -> application/json, otherwise text/plain).',
        },
      },
      required: ['webhookUrl', 'payload'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const webhookUrl = String(a.webhookUrl ?? '');
      return triggerWebhook(webhookUrl, a.payload);
    },
  });
}
