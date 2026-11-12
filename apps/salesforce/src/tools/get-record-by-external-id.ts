import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * get-record-by-external-id — Retrieve a Salesforce record by external ID field.
 * GET /services/data/v59.0/sobjects/{objectType}/{fieldName}/{fieldValue}
 */
export function registerGetRecordByExternalIdTool(app: AgentApp): void {
  app.tool('get-record-by-external-id', {
    description:
      'Retrieve a Salesforce record by external ID. Looks up a record using a custom external ID field. Params: objectType (required), fieldName (required), fieldValue (required).',
    parameters: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          description: 'Salesforce object type (e.g. Account, Contact, Opportunity).',
        },
        fieldName: {
          type: 'string',
          description: 'External ID field API name (e.g. External_Id__c).',
        },
        fieldValue: {
          type: 'string',
          description: 'External ID value to look up.',
        },
      },
      required: ['objectType', 'fieldName', 'fieldValue'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { objectType, fieldName, fieldValue } = args as {
        objectType: string;
        fieldName: string;
        fieldValue: string;
      };

      const data = (await salesforceRequest(
        'GET',
        `sobjects/${encodeURIComponent(objectType)}/${encodeURIComponent(fieldName)}/${encodeURIComponent(fieldValue)}`,
        undefined,
        ctx,
      )) as any;

      return data;
    },
  });
}
