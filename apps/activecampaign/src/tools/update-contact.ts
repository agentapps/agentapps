import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { parseContact, wrap } from './_helpers.js';

export function registerUpdateContactTool(app: AgentApp): void {
  app.tool('update-contact', {
    description: 'Update a contact by id. Only provided fields are updated. Returns { contact }.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        phone: { type: 'string' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      if (!(args as any).id?.trim()) throw new Error('id is required');
      if (
        (args as any).email !== undefined &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((args as any).email.trim())
      )
        throw new Error('email must be a valid address');
      const updates: Record<string, unknown> = {};
      if ((args as any).email !== undefined) updates.email = (args as any).email;
      if ((args as any).firstName !== undefined) updates.firstName = (args as any).firstName;
      if ((args as any).lastName !== undefined) updates.lastName = (args as any).lastName;
      if ((args as any).phone !== undefined) updates.phone = (args as any).phone;
      if (Object.keys(updates).length === 0)
        throw new Error('at least one field (email, firstName, lastName, phone) must be provided');
      const raw = (await acRequest(ctx, `/contacts/${encodeURIComponent((args as any).id)}`, {
        method: 'PUT',
        body: { contact: updates },
      })) as { contact?: unknown };
      return wrap({ contact: parseContact(raw.contact) });
    },
  });
}
