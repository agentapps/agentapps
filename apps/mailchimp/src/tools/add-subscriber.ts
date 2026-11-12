import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { buildAddSubscriberBody, shapeSubscriber, validateAddSubscriberArgs } from './_helpers.js';

/**
 * add-subscriber — POST /lists/{listId}/members.
 *
 * Adds a new subscriber (member) to an audience. The email_address and status
 * are required. Optional merge_fields can set FNAME, LNAME, etc.
 */
export function registerAddSubscriberTool(app: AgentApp): void {
  app.tool('add-subscriber', {
    description:
      'Add a subscriber to a Mailchimp audience (POST /lists/{listId}/members). Returns the created subscriber. Params: listId (required), email_address (required), status? ("subscribed"|"unsubscribed"|"cleaned"|"pending"|"transactional", default "subscribed"), merge_fields? ({ FNAME?, LNAME?, ... }).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'Id of the audience/list (required).' },
        email_address: { type: 'string', description: 'Email address to subscribe (required).' },
        status: {
          type: 'string',
          description: 'Subscription status (default "subscribed").',
          enum: ['subscribed', 'unsubscribed', 'cleaned', 'pending', 'transactional'],
          default: 'subscribed',
        },
        merge_fields: {
          type: 'object',
          description: 'Merge fields (e.g. { FNAME: "John", LNAME: "Doe" }).',
        },
      },
      required: ['listId', 'email_address'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      validateAddSubscriberArgs(args);
      const a = args as Record<string, unknown>;
      const listId = String(a.listId).trim();
      const body = buildAddSubscriberBody(a);

      const res = await mailchimpRequest<unknown>(
        ctx,
        `/lists/${encodeURIComponent(listId)}/members`,
        { method: 'POST', body },
      );

      return shapeSubscriber(res);
    },
  });
}
