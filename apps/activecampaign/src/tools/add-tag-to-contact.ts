import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { wrap } from './_helpers.js';

export function registerAddTagToContactTool(app: AgentApp): void {
  app.tool('add-tag-to-contact', {
    description: 'Assign a tag to a contact. Returns { contactTag: {id, contact, tag} }.',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        tagId: { type: 'string' },
      },
      required: ['contactId', 'tagId'],
    },
    // Tagging is a label on the contact, not a destruction; a tag can trigger automations in ActiveCampaign.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      if (!(args as any).contactId?.trim()) throw new Error('contactId is required');
      if (!(args as any).tagId?.trim()) throw new Error('tagId is required');
      const raw = (await acRequest(ctx, '/contactTags', {
        method: 'POST',
        body: {
          contactTag: {
            contact: (args as any).contactId,
            tag: (args as any).tagId,
          },
        },
      })) as { contactTag?: Record<string, unknown> };
      const ct = raw.contactTag ?? {};
      return wrap({
        contactTag: {
          id: String(ct.id ?? ''),
          contact: String(ct.contact ?? (args as any).contactId),
          tag: String(ct.tag ?? (args as any).tagId),
        },
      });
    },
  });
}
