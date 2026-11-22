import type { AgentApp } from '@agentapps/sdk';
import { formatAssociation, hubspotRequest } from '../lib/index.js';

/**
 * list-associations — GET /crm/v4/associations/{objectType}/{toObjectType}/{objectId}.
 */
export function registerListAssociationsTool(app: AgentApp): void {
  app.tool('list-associations', {
    description:
      'List all associations for a HubSpot object. Params: objectType, objectId, toObjectType, limit?',
    parameters: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          description: 'Object type.',
          enum: ['contacts', 'companies', 'deals', 'tickets'],
        },
        objectId: { type: 'string', description: 'HubSpot object ID.' },
        toObjectType: {
          type: 'string',
          description: 'Associated object type to retrieve.',
          enum: ['contacts', 'companies', 'deals', 'tickets'],
        },
        limit: { type: 'number', description: 'Max results. Default 100.' },
      },
      required: ['objectType', 'objectId', 'toObjectType'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const {
        objectType,
        objectId,
        toObjectType,
        limit = 100,
      } = args as {
        objectType: string;
        objectId: string;
        toObjectType: string;
        limit?: number;
      };

      const data = (await hubspotRequest(
        ctx,
        `/crm/v4/associations/${objectType}/${toObjectType}/${encodeURIComponent(objectId)}`,
        { params: { limit: Math.min(limit, 500) } },
      )) as any;

      return {
        associations: (data.results ?? []).map(formatAssociation),
        total: data.results?.length ?? 0,
      };
    },
  });
}
