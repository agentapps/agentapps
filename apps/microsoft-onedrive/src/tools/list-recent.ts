import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatItem } from '../lib/index.js';

/** list-recent — GET /me/drive/recent. */
export function registerListRecentTool(app: AgentApp): void {
  app.tool('list-recent', {
    description: 'List OneDrive files this account accessed recently, most recent first.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of items to return (default: 25, max: 200)',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const maxResults = Math.min((a.maxResults as number) || 25, 200);

      const response = await graphRequest<{ value?: any[] }>(
        'GET',
        `/me/drive/recent?$top=${maxResults}`,
      );
      const items = (response.value || []).map((item: any) => formatItem(item));

      return { account: email, count: items.length, items };
    },
  });
}
