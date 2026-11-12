import type { AgentApp } from '@agentapps/sdk';
import { buildProperties, formatContact, hubspotRequest } from '../lib/index.js';

/**
 * update-contact — PATCH /crm/v3/objects/contacts/{contactId}.
 */
export function registerUpdateContactTool(app: AgentApp): void {
  app.tool('update-contact', {
    description:
      'Update an existing HubSpot contact. Idempotent per-field — safe to retry. Params: contactId, email?, firstName?, lastName?, phone?, company?, jobTitle?, website?, lifecycleStage?, properties?',
    parameters: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'HubSpot contact ID.' },
        email: { type: 'string', description: 'Contact email address.' },
        firstName: { type: 'string', description: 'First name.' },
        lastName: { type: 'string', description: 'Last name.' },
        phone: { type: 'string', description: 'Phone number.' },
        company: { type: 'string', description: 'Company name.' },
        jobTitle: { type: 'string', description: 'Job title.' },
        website: { type: 'string', description: 'Website URL.' },
        lifecycleStage: {
          type: 'string',
          description: 'Lifecycle stage.',
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
      required: ['contactId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        contactId,
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
        contactId: string;
        email?: string;
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
        ...(email && { email }),
        ...(firstName && { firstname: firstName }),
        ...(lastName && { lastname: lastName }),
        ...(phone && { phone }),
        ...(company && { company }),
        ...(jobTitle && { jobtitle: jobTitle }),
        ...(website && { website }),
        ...(lifecycleStage && { lifecyclestage: lifecycleStage }),
        ...extraProps,
      };

      const data = (await hubspotRequest(
        ctx,
        `/crm/v3/objects/contacts/${encodeURIComponent(contactId)}`,
        {
          method: 'PATCH',
          body: buildProperties(payload),
        },
      )) as any;

      return formatContact(data);
    },
  });
}
