import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * create-lead — Create a new Salesforce lead.
 * POST /services/data/v59.0/sobjects/Lead
 */
export function registerCreateLeadTool(app: AgentApp): void {
  app.tool('create-lead', {
    description:
      'Create a new Salesforce lead. Returns the created lead ID. Params: firstName?, lastName (required), company (required), email?.',
    parameters: {
      type: 'object',
      properties: {
        firstName: { type: 'string', description: 'Lead first name.' },
        lastName: { type: 'string', description: 'Lead last name (required).' },
        company: { type: 'string', description: 'Company name (required).' },
        email: { type: 'string', description: 'Lead email address.' },
      },
      required: ['lastName', 'company'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { firstName, lastName, company, email } = args as {
        firstName?: string;
        lastName: string;
        company: string;
        email?: string;
      };

      const payload: Record<string, string> = {
        LastName: lastName,
        Company: company,
      };
      if (firstName) payload.FirstName = firstName;
      if (email) payload.Email = email;

      const data = (await salesforceRequest('POST', 'sobjects/Lead', payload, ctx)) as any;

      return {
        id: data.id,
        success: data.success ?? true,
      };
    },
  });
}
