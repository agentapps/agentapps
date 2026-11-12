import type { AgentApp } from '@agentapps/sdk';
import { odooCreate } from '../lib/odoo-client.js';

/**
 * create-partner — create a new Odoo partner (contact or company).
 */
export function registerCreatePartnerTool(app: AgentApp): void {
  app.tool('create-partner', {
    description: 'Create a new Odoo partner (contact or company).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Partner name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        isCompany: { type: 'boolean', description: 'Whether this is a company' },
        street: { type: 'string', description: 'Street address' },
        city: { type: 'string', description: 'City' },
        zip: { type: 'string', description: 'ZIP / postal code' },
        countryId: { type: 'number', description: 'Country ID' },
        parentId: { type: 'number', description: 'Parent company ID' },
        values: {
          type: 'object',
          description: 'Additional field values',
          additionalProperties: true,
        },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const values: Record<string, unknown> = {
        name: a.name,
        email: a.email,
        phone: a.phone,
        is_company: (a.isCompany as boolean) ?? false,
        street: a.street,
        city: a.city,
        zip: a.zip,
        country_id: a.countryId,
        parent_id: a.parentId,
        ...((a.values as Record<string, unknown>) ?? {}),
      };
      return odooCreate(ctx, 'res.partner', values);
    },
  });
}
