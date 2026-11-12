import type { AgentApp } from '@agentapps/sdk';
import { hubspotRequest } from '../lib/index.js';

/**
 * delete-deal — DELETE /crm/v3/objects/deals/{dealId}.
 *
 * Archives (soft-deletes) the deal. IRREVERSIBLE via API.
 */
export function registerDeleteDealTool(app: AgentApp): void {
  app.tool('delete-deal', {
    description:
      'Archive (soft delete) a HubSpot deal. Irreversible via API. Returns { success, dealId }.',
    parameters: {
      type: 'object',
      properties: {
        dealId: { type: 'string', description: 'HubSpot deal ID to archive.' },
      },
      required: ['dealId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { dealId } = args as { dealId: string };
      await hubspotRequest(ctx, `/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, {
        method: 'DELETE',
      });
      return { success: true, dealId };
    },
  });
}
