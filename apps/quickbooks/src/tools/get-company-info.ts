/**
 * get-company-info — retrieve QuickBooks Online company information.
 */

import type { AgentApp } from '@agentapps/sdk';
import { getQuickBooksAuth, quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerGetCompanyInfoTool(app: AgentApp): void {
  app.tool('get-company-info', {
    description:
      'Get company information for the connected QuickBooks Online account, including name, address, and fiscal year.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const { realmId } = await getQuickBooksAuth(ctx);
      return await quickbooksRequest('GET', `companyinfo/${realmId}`, null, ctx);
    },
  });
}
