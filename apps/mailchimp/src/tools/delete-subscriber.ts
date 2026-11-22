import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { isNonEmptyString } from './_helpers.js';

/**
 * delete-subscriber — DELETE /lists/{listId}/members/{subscriberHash}.
 *
 * Permanently deletes a subscriber from an audience. The subscriberHash is
 * the MD5 hash of the subscriber's lowercase email address.
 */
export function registerDeleteSubscriberTool(app: AgentApp): void {
  app.tool('delete-subscriber', {
    description:
      'Permanently delete a subscriber from a Mailchimp audience (DELETE /lists/{listId}/members/{subscriberHash}). Returns { deleted: true }. Params: listId (required), subscriberHash (required, MD5 hash of lowercase email).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'Id of the audience/list (required).' },
        subscriberHash: {
          type: 'string',
          description: 'MD5 hash of the subscriber email address in lowercase (required).',
        },
      },
      required: ['listId', 'subscriberHash'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      if (!isNonEmptyString(a.listId)) {
        throw new Error('listId is required and must be a non-empty string.');
      }
      if (!isNonEmptyString(a.subscriberHash)) {
        throw new Error(
          'subscriberHash is required and must be a non-empty string (MD5 hash of the subscriber email in lowercase).',
        );
      }
      const listId = String(a.listId).trim();
      const subscriberHash = String(a.subscriberHash).trim();

      await mailchimpRequest(
        ctx,
        `/lists/${encodeURIComponent(listId)}/members/${encodeURIComponent(subscriberHash)}`,
        { method: 'DELETE' },
      );

      return { deleted: true };
    },
  });
}
