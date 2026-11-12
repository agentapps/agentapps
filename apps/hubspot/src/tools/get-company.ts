import type { AgentApp } from '@agentapps/sdk';
import { formatCompany, hubspotRequest } from '../lib/index.js';

/**
 * get-company — GET /crm/v3/objects/companies/{companyId}.
 */
export function registerGetCompanyTool(app: AgentApp): void {
  app.tool('get-company', {
    description:
      'Retrieve a HubSpot company by ID or domain. Returns curated { id, name, domain, industry, type, phone, website, city, state, country, numberOfEmployees, annualRevenue, lifecycleStage, createdAt, updatedAt }. Params: companyId, idProperty?',
    parameters: {
      type: 'object',
      properties: {
        companyId: {
          type: 'string',
          description: 'Company ID (HubSpot ID) or domain if idProperty=domain.',
        },
        idProperty: {
          type: 'string',
          description:
            'Identifier type: "domain" to lookup by domain name. Default uses HubSpot ID.',
        },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional properties to include.',
        },
      },
      required: ['companyId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { companyId, idProperty, properties } = args as {
        companyId: string;
        idProperty?: string;
        properties?: string[];
      };

      const defaultProps = [
        'name',
        'domain',
        'industry',
        'type',
        'phone',
        'website',
        'city',
        'state',
        'country',
        'numberofemployees',
        'annualrevenue',
        'lifecyclestage',
        'createdate',
        'hs_lastmodifieddate',
      ];
      const allProps = properties ? [...new Set([...defaultProps, ...properties])] : defaultProps;

      const params: Record<string, any> = { properties: allProps.join(',') };
      if (idProperty) params.idProperty = idProperty;

      const data = (await hubspotRequest(
        ctx,
        `/crm/v3/objects/companies/${encodeURIComponent(companyId)}`,
        { params },
      )) as any;
      return formatCompany(data);
    },
  });
}
