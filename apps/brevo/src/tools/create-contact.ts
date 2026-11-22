import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import { buildCreateContactBody, validateCreateContactArgs } from './_helpers.js';

interface CreateContactResponse {
  id?: number;
}

/**
 * create-contact — POST /contacts.
 *
 * Brevo returns 201 `{ id }` when creating a new contact, or 204 (no body)
 * when `updateEnabled:true` updates an existing one. We surface `updated`
 * (true when no id came back) so the renderer can say "created" vs "updated".
 */
export function registerCreateContactTool(app: AgentApp): void {
  app.tool('create-contact', {
    description:
      'Create (or update) a contact in Brevo (POST /contacts). Returns { id, email, listIds, updated }. Set updateEnabled:true to update an existing contact instead of failing on a duplicate. Params: email (required), attributes? (e.g. { FIRSTNAME, LASTNAME, SMS }), listIds? (number[]), updateEnabled? (default false).',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Contact email address (required).' },
        attributes: {
          type: 'object',
          description:
            'Contact attributes keyed by Brevo attribute name (e.g. { FIRSTNAME, LASTNAME, SMS }).',
        },
        listIds: {
          type: 'array',
          description: 'Brevo list ids to add the contact to.',
          items: { type: 'number' },
        },
        updateEnabled: {
          type: 'boolean',
          description:
            'If true, update the contact when it already exists instead of erroring (default false).',
          default: false,
        },
      },
      required: ['email'],
    },
    // With updateEnabled it updates fields of an existing contact; a field update is not
    // destructive, and delete-contact removes a contact created by mistake.
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      validateCreateContactArgs(args);
      const body = buildCreateContactBody(args as Record<string, unknown>);

      const res = await brevoRequest<CreateContactResponse>(ctx, '/contacts', {
        method: 'POST',
        body,
      });

      const id = typeof res?.id === 'number' ? res.id : null;
      return {
        id,
        email: body.email,
        listIds: body.listIds ?? [],
        updated: id == null && body.updateEnabled === true,
      };
    },
  });
}
