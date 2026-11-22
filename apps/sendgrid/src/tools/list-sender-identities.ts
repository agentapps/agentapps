/**
 * list-sender-identities — GET /verified_senders
 *
 * List all verified sender identities from SendGrid.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

interface ListVerifiedSendersResponse {
  results?: unknown[];
}

export function registerListSenderIdentitiesTool(app: AgentApp): void {
  app.tool('list-sender-identities', {
    description:
      'List all verified sender identities from SendGrid (GET /verified_senders). Returns { senders }.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const res = (await sendgridRequest(
        'GET',
        '/verified_senders',
        null,
        ctx,
      )) as ListVerifiedSendersResponse;

      return {
        senders: res.results ?? [],
      };
    },
  });
}
