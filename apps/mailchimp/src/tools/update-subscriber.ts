import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import {
  buildUpdateSubscriberBody,
  shapeSubscriber,
  validateUpdateSubscriberArgs,
} from './_helpers.js';

/**
 * update-subscriber — PATCH /lists/{listId}/members/{subscriberHash}.
 *
 * Updates an existing subscriber. The subscriberHash is the MD5 hash of the
 * subscriber's lowercase email address.
 */
export function registerUpdateSubscriberTool(app: AgentApp): void {
  app.tool('update-subscriber', {
    description:
      'Update a subscriber in a Mailchimp audience (PATCH /lists/{listId}/members/{subscriberHash}). Returns the updated subscriber. Params: listId (required), subscriberHash (required, MD5 hash of lowercase email), email_address? (new email), status? ("subscribed"|"unsubscribed"|"cleaned"|"pending"|"transactional"), merge_fields? ({ FNAME?, LNAME?, ... }).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'Id of the audience/list (required).' },
        subscriberHash: {
          type: 'string',
          description: 'MD5 hash of the subscriber email address in lowercase (required).',
        },
        email_address: { type: 'string', description: 'New email address for the subscriber.' },
        status: {
          type: 'string',
          description: 'Subscription status.',
          enum: ['subscribed', 'unsubscribed', 'cleaned', 'pending', 'transactional'],
        },
        merge_fields: {
          type: 'object',
          description: 'Merge fields (e.g. { FNAME: "John", LNAME: "Doe" }).',
        },
      },
      required: ['listId', 'subscriberHash'],
    },
    // Setting the email, status or merge fields again undoes it; not a change the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      validateUpdateSubscriberArgs(args);
      const a = args as Record<string, unknown>;
      const listId = String(a.listId).trim();
      const subscriberHash = String(a.subscriberHash).trim();
      const body = buildUpdateSubscriberBody(a);

      const res = await mailchimpRequest<unknown>(
        ctx,
        `/lists/${encodeURIComponent(listId)}/members/${encodeURIComponent(subscriberHash)}`,
        { method: 'PATCH', body },
      );

      return shapeSubscriber(res);
    },
  });
}
