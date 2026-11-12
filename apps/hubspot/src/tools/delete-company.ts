import type { AgentApp } from '@agentapps/sdk';
import { hubspotRequest } from '../lib/index.js';

/**
 * delete-company — DELETE /crm/v3/objects/companies/{companyId}.
 *
 * Archives (soft-deletes) the company. IRREVERSIBLE via API.
 */
export function registerDeleteCompanyTool(app: AgentApp): void {
  app.tool('delete-company', {
    description:
      'Archive (soft delete) a HubSpot company. Irreversible via API. Returns { success, companyId }.',
    parameters: {
      type: 'object',
      properties: {
        companyId: { type: 'string', description: 'HubSpot company ID to archive.' },
      },
      required: ['companyId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { companyId } = args as { companyId: string };
      await hubspotRequest(ctx, `/crm/v3/objects/companies/${encodeURIComponent(companyId)}`, {
        method: 'DELETE',
      });
      return { success: true, companyId };
    },
  });
}
