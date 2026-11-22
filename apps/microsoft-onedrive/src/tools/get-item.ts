import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatItem, ITEM_SELECT, itemRef } from '../lib/index.js';

/** get-item — GET {itemRef}. */
export function registerGetItemTool(app: AgentApp): void {
  app.tool('get-item', {
    description:
      'Get metadata for a single OneDrive file or folder, addressed by itemId or by path.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Item ID. Takes precedence over path.' },
        path: {
          type: 'string',
          description:
            'Item path relative to the drive root, e.g. "Documents/notes.txt". Pass literal file and folder names, not pre-encoded ones.',
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
      const item = await graphRequest<Record<string, any>>(
        'GET',
        `${itemRef(a)}?$select=${ITEM_SELECT}`,
      );

      return { account: email, item: formatItem(item) };
    },
  });
}
