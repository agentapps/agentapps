import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * create-account — Create a new Salesforce account.
 * POST /services/data/v59.0/sobjects/Account
 */
export function registerCreateAccountTool(app: AgentApp): void {
  app.tool('create-account', {
    description:
      'Create a new Salesforce account. Returns the created account ID. Params: name (required), industry?, phone?, website?, type?, description?.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Account name (required).' },
        industry: { type: 'string', description: 'Industry (e.g. Technology, Healthcare).' },
        phone: { type: 'string', description: 'Phone number.' },
        website: { type: 'string', description: 'Website URL.' },
        type: { type: 'string', description: 'Account type (e.g. Customer, Partner, Prospect).' },
        description: { type: 'string', description: 'Account description.' },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { name, industry, phone, website, type, description } = args as {
        name: string;
        industry?: string;
        phone?: string;
        website?: string;
        type?: string;
        description?: string;
      };

      const payload: Record<string, string> = { Name: name };
      if (industry) payload.Industry = industry;
      if (phone) payload.Phone = phone;
      if (website) payload.Website = website;
      if (type) payload.Type = type;
      if (description) payload.Description = description;

      const data = (await salesforceRequest('POST', 'sobjects/Account', payload, ctx)) as any;

      return {
        id: data.id,
        success: data.success ?? true,
      };
    },
  });
}
