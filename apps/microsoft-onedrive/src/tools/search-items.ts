import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatItem } from '../lib/index.js';

/** search-items — GET /me/drive/root/search(q='...'). */
export function registerSearchItemsTool(app: AgentApp): void {
  app.tool('search-items', {
    description: 'Search OneDrive for files and folders matching a free-text query.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search query' },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 25, max: 200)',
        },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const query = a.query as string;
      const maxResults = Math.min((a.maxResults as number) || 25, 200);

      const escaped = query.replace(/'/g, "''");
      const response = await graphRequest<{ value?: any[] }>(
        'GET',
        `/me/drive/root/search(q='${encodeURIComponent(escaped)}')?$top=${maxResults}`,
      );
      const items = (response.value || []).map((item: any) => formatItem(item));

      return { account: email, query, count: items.length, items };
    },
  });
}
