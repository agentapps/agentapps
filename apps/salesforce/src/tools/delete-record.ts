import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * delete-record — Delete any Salesforce record by object type and ID.
 * DELETE /services/data/v59.0/sobjects/{objectType}/{recordId}
 */
export function registerDeleteRecordTool(app: AgentApp): void {
  app.tool('delete-record', {
    description:
      'Delete a Salesforce record. Generic tool that works with any sObject type (Account, Contact, Opportunity, Lead, Case, etc.). Params: objectType (required), recordId (required).',
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
      },
      required: ['objectType', 'recordId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { objectType, recordId } = args as {
        objectType: string;
        recordId: string;
      };

      await salesforceRequest(
        'DELETE',
        `sobjects/${encodeURIComponent(objectType)}/${encodeURIComponent(recordId)}`,
        undefined,
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
