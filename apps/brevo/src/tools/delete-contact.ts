import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import { validateContactIdentifier } from './_helpers.js';

/**
 * delete-contact — DELETE /contacts/{identifier}.
 *
 * Permanently deletes the contact. IRREVERSIBLE + destructive.
 */
export function registerDeleteContactTool(app: AgentApp): void {
  app.tool('delete-contact', {
    description:
      'Delete a contact permanently from Brevo (DELETE /contacts/{identifier}). IRREVERSIBLE — the contact and its history are removed. Returns { identifier, deleted }. Params: identifier (required — the contact email or id).',
    parameters: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'The contact email or numeric id to delete (required).',
        },
      },
      required: ['identifier'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      idempotentHint: true,
    },
    handler: async (args, ctx) => {
      const identifier = validateContactIdentifier((args as Record<string, unknown>)?.identifier);
      await brevoRequest<unknown>(ctx, `/contacts/${encodeURIComponent(identifier)}`, {
        method: 'DELETE',
      });
      return { identifier, deleted: true };
    },
  });
}
