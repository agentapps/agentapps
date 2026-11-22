import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * create-contact — POST /contacts
 *
 * Creates a new Freshdesk contact.
 */
export function registerCreateContactTool(app: AgentApp): void {
  app.tool('create-contact', {
    description:
      'Create a new Freshdesk contact (POST /api/v2/contacts). Requires name. Optionally provide email, phone, mobile, and other fields. Returns the created contact.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Full name of the contact.',
        },
        email: {
          type: 'string',
          description: 'Email address of the contact.',
        },
        phone: {
          type: 'string',
          description: 'Phone number of the contact.',
        },
        mobile: {
          type: 'string',
          description: 'Mobile number of the contact.',
        },
        job_title: {
          type: 'string',
          description: 'Job title of the contact.',
        },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        name: args.name,
      };
      if (args.email !== undefined) params.email = args.email;
      if (args.phone !== undefined) params.phone = args.phone;
      if (args.mobile !== undefined) params.mobile = args.mobile;
      if (args.job_title !== undefined) params.job_title = args.job_title;

      return await freshdeskRequest('POST', '/contacts', params, ctx);
    },
  });
}
