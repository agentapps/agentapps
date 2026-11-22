import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, requireItemRef } from '../lib/index.js';

/** delete-item — DELETE {itemRef}. Moves the item to the recycle bin. */
export function registerDeleteItemTool(app: AgentApp): void {
  app.tool('delete-item', {
    description:
      'Delete a OneDrive file or folder. The item moves to the recycle bin, but this app cannot restore it.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Item ID. Takes precedence over path.' },
        path: {
          type: 'string',
          description:
            'Item path relative to the drive root. Pass literal file and folder names, not pre-encoded ones.',
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      // The app cannot undo this.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      await graphRequest('DELETE', requireItemRef(a));

      return {
        success: true,
        account: email,
        message: 'Item moved to the OneDrive recycle bin.',
      };
    },
  });
}
