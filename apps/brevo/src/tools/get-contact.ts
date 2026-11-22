import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import { shapeContact, validateContactIdentifier } from './_helpers.js';

/**
 * get-contact — GET /contacts/{identifier}.
 *
 * `identifier` is an email or a numeric contact id (or EXT_ID). It is
 * URL-encoded into the path.
 */
export function registerGetContactTool(app: AgentApp): void {
  app.tool('get-contact', {
    description:
      'Get one contact by email or id from Brevo (GET /contacts/{identifier}). Returns { id, email, emailBlacklisted, smsBlacklisted, listIds, attributes, createdAt, modifiedAt }. Params: identifier (required — the contact email or id).',
    parameters: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'The contact email or numeric id (required).',
        },
      },
      required: ['identifier'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const identifier = validateContactIdentifier((args as Record<string, unknown>)?.identifier);
      const res = await brevoRequest<unknown>(ctx, `/contacts/${encodeURIComponent(identifier)}`);
      return shapeContact(res);
    },
  });
}
