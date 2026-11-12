import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import {
  buildMembershipBody,
  coerceInt,
  shapeMembershipResult,
  validateMembershipArgs,
} from './_helpers.js';

/**
 * add-contact-to-list — POST /contacts/lists/{listId}/contacts/add.
 *
 * Identify contacts by emails[] and/or ids[]. Reversible with
 * remove-contact-from-list, so not marked irreversible/destructive.
 */
export function registerAddContactToListTool(app: AgentApp): void {
  app.tool('add-contact-to-list', {
    description:
      'Add contacts to a Brevo list (POST /contacts/lists/{listId}/contacts/add). Identify contacts by emails[] and/or ids[]. Returns { listId, success, failure } (contacts that were / were not added). Params: listId (required, integer), emails? (string[]), ids? (number[]).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'number', description: 'Id of the list (required).' },
        emails: {
          type: 'array',
          description: 'Contact emails to add.',
          items: { type: 'string' },
        },
        ids: {
          type: 'array',
          description: 'Contact ids to add.',
          items: { type: 'number' },
        },
      },
      required: ['listId'],
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      validateMembershipArgs(args);
      const a = args as Record<string, unknown>;
      const listId = coerceInt(a.listId) as number;
      const body = buildMembershipBody(a);

      const res = await brevoRequest<unknown>(ctx, `/contacts/lists/${listId}/contacts/add`, {
        method: 'POST',
        body,
      });

      return { listId, ...shapeMembershipResult(res) };
    },
  });
}
