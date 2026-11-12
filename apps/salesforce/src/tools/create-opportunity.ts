import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * create-opportunity — Create a new Salesforce opportunity.
 * POST /services/data/v59.0/sobjects/Opportunity
 */
export function registerCreateOpportunityTool(app: AgentApp): void {
  app.tool('create-opportunity', {
    description:
      'Create a new Salesforce opportunity. Returns the created opportunity ID. Params: name (required), stageName (required), closeDate (required, YYYY-MM-DD), amount?, accountId?.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Opportunity name (required).' },
        stageName: {
          type: 'string',
          description: 'Sales stage (required, e.g. Prospecting, Closed Won).',
        },
        closeDate: {
          type: 'string',
          description: 'Expected close date in YYYY-MM-DD format (required).',
        },
        amount: { type: 'number', description: 'Opportunity amount.' },
        accountId: { type: 'string', description: 'Salesforce Account ID to associate with.' },
      },
      required: ['name', 'stageName', 'closeDate'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { name, stageName, closeDate, amount, accountId } = args as {
        name: string;
        stageName: string;
        closeDate: string;
        amount?: number;
        accountId?: string;
      };

      const payload: Record<string, unknown> = {
        Name: name,
        StageName: stageName,
        CloseDate: closeDate,
      };
      if (amount !== undefined) payload.Amount = amount;
      if (accountId) payload.AccountId = accountId;

      const data = (await salesforceRequest('POST', 'sobjects/Opportunity', payload, ctx)) as any;

      return {
        id: data.id,
        success: data.success ?? true,
      };
    },
  });
}
