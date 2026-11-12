import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import { shapeAttribute } from './_helpers.js';

interface ListAttributesResponse {
  attributes?: unknown[];
}

/**
 * list-attributes — GET /contacts/attributes.
 *
 * The contact attributes defined in the account (FIRSTNAME, LASTNAME, custom
 * fields...). Needed to know which attribute keys are valid before
 * create-contact / update-contact / import-contacts. No pagination — Brevo
 * returns the full set.
 */
export function registerListAttributesTool(app: AgentApp): void {
  app.tool('list-attributes', {
    description:
      'List the contact attributes defined in the Brevo account (GET /contacts/attributes). Use it to discover valid attribute keys (e.g. FIRSTNAME, LASTNAME, custom fields) before creating/updating/importing contacts. Returns { attributes:[{name,category,type}], count }. No params.',
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
      const res = await brevoRequest<ListAttributesResponse>(ctx, '/contacts/attributes');
      const attributes = (res.attributes ?? []).map(shapeAttribute);
      return { attributes, count: attributes.length };
    },
  });
}
