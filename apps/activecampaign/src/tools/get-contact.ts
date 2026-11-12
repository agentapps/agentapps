import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { parseContact, wrap } from './_helpers.js';

export function registerGetContactTool(app: AgentApp): void {
  app.tool('get-contact', {
    description:
      'Get a contact by id. Returns { contact: {id,email,firstName,lastName,phone,cdate,udate} }.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      if (!(args as any).id?.trim()) throw new Error('id is required');
      const raw = (await acRequest(ctx, `/contacts/${encodeURIComponent((args as any).id)}`)) as {
        contact?: unknown;
      };
      return wrap({ contact: parseContact(raw.contact) });
    },
  });
}
