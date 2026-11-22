import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, destinationRef, formatItem, requireItemRef } from '../lib/index.js';

/** move-item — PATCH {itemRef} with a new parentReference. */
export function registerMoveItemTool(app: AgentApp): void {
  app.tool('move-item', {
    description:
      'Move a OneDrive file or folder into a different folder. Specify the item with itemId or path, and the destination with destinationFolderId or destinationPath; with neither destination, the item is moved to the drive root.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Item ID to move. Takes precedence over path.' },
        path: {
          type: 'string',
          description:
            'Path of the item to move, relative to the drive root. Pass literal file and folder names, not pre-encoded ones.',
        },
        destinationFolderId: {
          type: 'string',
          description: 'Destination folder ID. Takes precedence over destinationPath.',
        },
        destinationPath: {
          type: 'string',
          description:
            'Destination folder path relative to the drive root. Pass literal folder names, not pre-encoded ones. Omitting both destination arguments moves the item to the drive root.',
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const base = requireItemRef(a);

      const moved = await graphRequest<Record<string, any>>('PATCH', base, {
        parentReference: destinationRef(a),
      });

      return { success: true, account: email, item: formatItem(moved) };
    },
  });
}
