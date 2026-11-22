import type { AgentApp } from '@agentapps/sdk';
import { formatList, hubspotRequest, LISTS_API } from '../lib/index.js';

/**
 * get-list — GET /crm/lists/2026-03/{listId}.
 */
export function registerGetListTool(app: AgentApp): void {
  app.tool('get-list', {
    description: 'Get a specific HubSpot list by ID (CRM Lists v3). Params: listId',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'HubSpot list ID.' },
      },
      required: ['listId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { listId } = args as { listId: string | number };

      const data = (await hubspotRequest(
        ctx,
        `${LISTS_API}/${encodeURIComponent(String(listId))}`,
        { params: { additionalProperties: 'hs_list_size' } },
      )) as any;

      return formatList(data.list ?? data);
    },
  });
}
