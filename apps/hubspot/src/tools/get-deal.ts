import type { AgentApp } from '@agentapps/sdk';
import { formatDeal, hubspotRequest } from '../lib/index.js';

/**
 * get-deal — GET /crm/v3/objects/deals/{dealId}.
 */
export function registerGetDealTool(app: AgentApp): void {
  app.tool('get-deal', {
    description:
      'Retrieve a HubSpot deal by ID. Returns curated { id, name, amount, stage, pipeline, type, closeDate, probability, description, source, createdAt, updatedAt }. Params: dealId',
    parameters: {
      type: 'object',
      properties: {
        dealId: { type: 'string', description: 'HubSpot deal ID.' },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional properties to include.',
        },
      },
      required: ['dealId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { dealId, properties } = args as {
        dealId: string;
        properties?: string[];
      };

      const defaultProps = [
        'dealname',
        'amount',
        'dealstage',
        'pipeline',
        'dealtype',
        'closedate',
        'probability',
        'description',
        'hs_analytics_source',
        'createdate',
        'hs_lastmodifieddate',
      ];
      const allProps = properties ? [...new Set([...defaultProps, ...properties])] : defaultProps;

      const data = (await hubspotRequest(
        ctx,
        `/crm/v3/objects/deals/${encodeURIComponent(dealId)}`,
        {
          params: { properties: allProps.join(',') },
        },
      )) as any;
      return formatDeal(data);
    },
  });
}
