import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatItem, requireItemRef } from '../lib/index.js';

/** rename-item — PATCH {itemRef} with a new name. */
export function registerRenameItemTool(app: AgentApp): void {
  app.tool('rename-item', {
    description: 'Rename a OneDrive file or folder without moving it.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Item ID. Takes precedence over path.' },
        path: {
          type: 'string',
          description:
            'Item path relative to the drive root. Pass literal file and folder names, not pre-encoded ones.',
        },
        newName: { type: 'string', description: 'The new name for the item' },
      },
      required: ['newName'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const renamed = await graphRequest<Record<string, any>>('PATCH', requireItemRef(a), {
        name: a.newName as string,
      });

      return { success: true, account: email, item: formatItem(renamed) };
    },
  });
}
