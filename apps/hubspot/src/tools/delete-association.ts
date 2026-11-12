import type { AgentApp } from '@agentapps/sdk';
import { hubspotRequest } from '../lib/index.js';

/**
 * delete-association — POST /crm/v4/associations/{from}/{to}/batch/archive.
 */
export function registerDeleteAssociationTool(app: AgentApp): void {
  app.tool('delete-association', {
    description:
      'Delete an association between two HubSpot CRM objects. Params: fromObjectType, fromObjectId, toObjectType, toObjectId, associationType?',
    parameters: {
      type: 'object',
      properties: {
        fromObjectType: {
          type: 'string',
          description: 'Source object type.',
          enum: ['contacts', 'companies', 'deals', 'tickets'],
        },
        fromObjectId: { type: 'string', description: 'Source object HubSpot ID.' },
        toObjectType: {
          type: 'string',
          description: 'Target object type.',
          enum: ['contacts', 'companies', 'deals', 'tickets'],
        },
        toObjectId: { type: 'string', description: 'Target object HubSpot ID.' },
        associationType: {
          type: 'string',
          description: 'Association type ID. Optional.',
        },
      },
      required: ['fromObjectType', 'fromObjectId', 'toObjectType', 'toObjectId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { fromObjectType, fromObjectId, toObjectType, toObjectId, associationType } = args as {
        fromObjectType: string;
        fromObjectId: string;
        toObjectType: string;
        toObjectId: string;
        associationType?: string;
      };

      const body: Record<string, any> = {
        inputs: [
          {
            from: { id: fromObjectId },
            to: { id: toObjectId },
            ...(associationType && {
              types: [
                { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: associationType },
              ],
            }),
          },
        ],
      };

      await hubspotRequest(
        ctx,
        `/crm/v4/associations/${fromObjectType}/${toObjectType}/batch/archive`,
        { method: 'POST', body },
      );

      return { success: true, fromObjectId, toObjectId };
    },
  });
}
