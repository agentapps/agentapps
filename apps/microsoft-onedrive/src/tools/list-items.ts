import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatItem, ITEM_SELECT, itemRef } from '../lib/index.js';

/** list-items — GET {itemRef}/children. */
export function registerListItemsTool(app: AgentApp): void {
  app.tool('list-items', {
    description:
      'List files and folders inside a OneDrive folder. Defaults to the drive root. Address the folder by itemId or by path.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Folder item ID. Takes precedence over path.' },
        path: {
          type: 'string',
          description:
            'Folder path relative to the drive root, e.g. "Documents/Reports". Pass literal folder names, not pre-encoded ones.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of items to return (default: 50, max: 200)',
        },
      },
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
      const maxResults = Math.min((a.maxResults as number) || 50, 200);
      const base = itemRef(a);

      const response = await graphRequest<{ value?: any[] }>(
        'GET',
        `${base}/children?$top=${maxResults}&$select=${ITEM_SELECT}`,
      );
      const items = (response.value || []).map((item: any) => formatItem(item));

      return { account: email, count: items.length, items };
    },
  });
}
