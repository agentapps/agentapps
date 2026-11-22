import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { parseContact, wrap } from './_helpers.js';

export function registerCreateContactTool(app: AgentApp): void {
  app.tool('create-contact', {
    description:
      'Create a contact. Email is required. Returns { contact } with the created record. ActiveCampaign upserts by email; if it exists you get the existing contact.',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        phone: { type: 'string' },
      },
      required: ['email'],
    },
    // POST /contact/sync upserts by email: the same call twice leaves one contact, and it can
    // overwrite the fields of an existing one (setting them again undoes it).
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      if (!(args as any).email?.trim()) throw new Error('email is required');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((args as any).email.trim()))
        throw new Error('email must be a valid address');
      const body: Record<string, unknown> = { email: (args as any).email.trim() };
      if ((args as any).firstName) body.firstName = (args as any).firstName;
      if ((args as any).lastName) body.lastName = (args as any).lastName;
      if ((args as any).phone) body.phone = (args as any).phone;
      const raw = (await acRequest(ctx, '/contact/sync', {
        method: 'POST',
        body: { contact: body },
      })) as { contact?: unknown };
      return wrap({ contact: parseContact(raw.contact) });
    },
  });
}
