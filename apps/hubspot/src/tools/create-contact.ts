import type { AgentApp } from '@agentapps/sdk';
import { buildProperties, formatContact, hubspotRequest } from '../lib/index.js';

/**
 * create-contact — POST /crm/v3/objects/contacts.
 */
export function registerCreateContactTool(app: AgentApp): void {
  app.tool('create-contact', {
    description:
      'Create a new HubSpot contact. Returns curated contact shape. Not retryable (no idempotency key). Params: email, firstName?, lastName?, phone?, company?, jobTitle?, website?, lifecycleStage?, properties?',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Contact email address (required, unique).' },
        firstName: { type: 'string', description: 'First name.' },
        lastName: { type: 'string', description: 'Last name.' },
        phone: { type: 'string', description: 'Phone number.' },
        company: { type: 'string', description: 'Company name.' },
        jobTitle: { type: 'string', description: 'Job title.' },
        website: { type: 'string', description: 'Website URL.' },
        lifecycleStage: {
          type: 'string',
          description:
            'Lifecycle stage: subscriber, lead, marketingqualifiedlead, salesqualifiedlead, opportunity, customer, evangelist, other.',
          enum: [
            'subscriber',
            'lead',
            'marketingqualifiedlead',
            'salesqualifiedlead',
            'opportunity',
            'customer',
            'evangelist',
            'other',
          ],
        },
        properties: {
          type: 'object',
          description: 'Additional HubSpot contact properties as key-value pairs.',
        },
      },
      required: ['email'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        email,
        firstName,
        lastName,
        phone,
        company,
        jobTitle,
        website,
        lifecycleStage,
        properties: extraProps,
      } = args as {
        email: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        company?: string;
        jobTitle?: string;
        website?: string;
        lifecycleStage?: string;
        properties?: Record<string, string>;
      };

      const payload: Record<string, any> = {
        email,
        ...(firstName && { firstname: firstName }),
        ...(lastName && { lastname: lastName }),
        ...(phone && { phone }),
        ...(company && { company }),
        ...(jobTitle && { jobtitle: jobTitle }),
        ...(website && { website }),
        ...(lifecycleStage && { lifecyclestage: lifecycleStage }),
        ...extraProps,
      };

      const data = (await hubspotRequest(ctx, '/crm/v3/objects/contacts', {
        method: 'POST',
        body: buildProperties(payload),
      })) as any;

      return formatContact(data);
    },
  });
}
