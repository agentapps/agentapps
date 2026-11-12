/**
 * create_webhook — create a webhook for an Airtable base.
 */

import type { AgentApp } from '@agentapps/sdk';
import { airtableRequest } from '../lib/airtable-client.js';

export function registerCreateWebhookTool(app: AgentApp): void {
  app.tool('create_webhook', {
    description:
      'Create a webhook for an Airtable base to receive notifications when data changes. Returns the webhook ID and MAC secret.',
    parameters: {
      type: 'object',
      properties: {
        baseId: {
          type: 'string',
          description: 'The Airtable base ID (e.g. appXXXXXXXXXXXXXX).',
        },
        notificationUrl: {
          type: 'string',
          description: 'The URL that Airtable will send webhook notifications to.',
        },
        specification: {
          type: 'object',
          description: 'Webhook specification defining which changes to listen for.',
          properties: {
            options: {
              type: 'object',
              description: 'Webhook options including filters for tables and data types.',
              properties: {
                filters: {
                  type: 'object',
                  description: 'Filters to narrow which changes trigger the webhook.',
                  properties: {
                    dataTypes: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Data types to listen for (e.g. "tableData", "tableFields", "tableMetadata").',
                    },
                    recordChangeScope: {
                      type: 'string',
                      description: 'The table ID to scope record changes to.',
                    },
                  },
                },
              },
            },
          },
        },
      },
      required: ['baseId', 'notificationUrl'],
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const baseId = args.baseId as string;
      const notificationUrl = args.notificationUrl as string;
      const specification = args.specification as Record<string, unknown> | undefined;

      const body: Record<string, unknown> = { notificationUrl };
      if (specification) {
        body.specification = specification;
      }

      return await airtableRequest('POST', `/bases/${baseId}/webhooks`, { body }, ctx);
    },
  });
}
