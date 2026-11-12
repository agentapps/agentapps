/**
 * list-contact-lists — GET /marketing/lists
 *
 * Retrieve all contact lists from SendGrid Marketing Campaigns.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

interface ListContactListsResponse {
  result?: unknown[];
}

export function registerListContactListsTool(app: AgentApp): void {
  app.tool('list-contact-lists', {
    description:
      'List all contact lists from SendGrid Marketing Campaigns (GET /marketing/lists). Returns { lists }.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const res = (await sendgridRequest(
        'GET',
        '/marketing/lists',
        null,
        ctx,
      )) as ListContactListsResponse;

      return {
        lists: res.result ?? [],
      };
    },
  });
}
