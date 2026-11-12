import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { wrap } from './_helpers.js';

export function registerSubscribeContactToListTool(app: AgentApp): void {
  app.tool('subscribe-contact-to-list', {
    description:
      'Subscribe (or unsubscribe) a contact to a list. Returns { contactList: {id, contact, list, status} }.',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string' },
        listId: { type: 'string' },
        status: { type: 'string', enum: ['subscribed', 'unsubscribed'] },
      },
      required: ['contactId', 'listId'],
    },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      if (!(args as any).contactId?.trim()) throw new Error('contactId is required');
      if (!(args as any).listId?.trim()) throw new Error('listId is required');
      const STATUS_MAP: Record<string, number> = {
        subscribed: 1,
        unsubscribed: 2,
      };
      const numericStatus = STATUS_MAP[(args as any).status ?? 'subscribed'];
      const raw = (await acRequest(ctx, '/contactLists', {
        method: 'POST',
        body: {
          contactList: {
            list: (args as any).listId,
            contact: (args as any).contactId,
            status: numericStatus,
          },
        },
      })) as { contactList?: Record<string, unknown> };
      const cl = raw.contactList ?? {};
      return wrap({
        contactList: {
          id: String(cl.id ?? ''),
          contact: String(cl.contact ?? (args as any).contactId),
          list: String(cl.list ?? (args as any).listId),
          status: (args as any).status ?? 'subscribed',
        },
      });
    },
  });
}
