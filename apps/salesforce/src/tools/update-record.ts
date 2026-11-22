import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * update-record — Update any Salesforce record by object type and ID.
 * PATCH /services/data/v59.0/sobjects/{objectType}/{recordId}
 */
export function registerUpdateRecordTool(app: AgentApp): void {
  app.tool('update-record', {
    description:
      'Update a Salesforce record. Generic tool that works with any sObject type (Account, Contact, Opportunity, Lead, Case, etc.). Params: objectType (required), recordId (required), fields (required, object of field-value pairs).',
    parameters: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          description: 'Salesforce object type (e.g. Account, Contact, Opportunity, Lead, Case).',
        },
        recordId: {
          type: 'string',
          description: 'Salesforce record ID (18-char).',
        },
        fields: {
          type: 'object',
          description:
            'Object of field API names to values (e.g. {"Name": "New Name", "Phone": "+1-555-0100"}).',
          additionalProperties: true,
        },
      },
      required: ['objectType', 'recordId', 'fields'],
    },
    // Setting the fields again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { objectType, recordId, fields } = args as {
        objectType: string;
        recordId: string;
        fields: Record<string, unknown>;
      };

      await salesforceRequest(
        'PATCH',
        `sobjects/${encodeURIComponent(objectType)}/${encodeURIComponent(recordId)}`,
        fields,
        ctx,
      );

      return {
        success: true,
        objectType,
        recordId,
      };
    },
  });
}
