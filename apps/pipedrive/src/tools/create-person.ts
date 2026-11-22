/**
 * create-person — create a new person (contact) in Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerCreatePersonTool(app: AgentApp): void {
  app.tool('create-person', {
    description: 'Create a new person (contact) in Pipedrive. Returns the created person object.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Full name of the person (required).',
        },
        email: {
          type: 'string',
          description: 'Email address of the person.',
        },
        phone: {
          type: 'string',
          description: 'Phone number of the person.',
        },
        org_id: {
          type: 'number',
          description: 'ID of the organization this person belongs to.',
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
      const body: Record<string, unknown> = { name: args.name };
      if (args.email) body.email = [{ value: args.email, primary: true, label: 'work' }];
      if (args.phone) body.phone = [{ value: args.phone, primary: true, label: 'work' }];
      if (args.org_id) body.org_id = args.org_id;

      return await pipedriveRequest('POST', '/persons', { body }, ctx);
    },
  });
}
