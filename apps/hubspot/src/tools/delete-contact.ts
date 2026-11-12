import type { AgentApp } from '@agentapps/sdk';
import { hubspotRequest } from '../lib/index.js';

/**
 * delete-contact — DELETE /crm/v3/objects/contacts/{contactId}.
 *
 * Archives (soft-deletes) the contact. IRREVERSIBLE via API.
 */
export function registerDeleteContactTool(app: AgentApp): void {
  app.tool('delete-contact', {
    description:
      'Archive (soft delete) a HubSpot contact. Irreversible via API. Returns { success, contactId }.',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'HubSpot contact ID to archive.' },
      },
      required: ['contactId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { contactId } = args as { contactId: string };
      await hubspotRequest(ctx, `/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`, {
        method: 'DELETE',
      });
      return { success: true, contactId };
    },
  });
}
