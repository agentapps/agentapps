import type { AgentApp } from '@agentapps/sdk';
import { canvaRequest } from '../lib/index.js';
import { validateNonEmpty } from './_validate.js';

export function registerMoveItemTool(app: AgentApp): void {
  app.tool('move-item', {
    description:
      'Move an item (design / folder / asset) to another folder. Idempotent if target unchanged. Returns { itemId, toFolderId, moved: true }. Params: itemId, toFolderId.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'ID of the item to move.' },
        toFolderId: {
          type: 'string',
          description: 'Destination folder ID (use "root" for top level).',
        },
      },
      required: ['itemId', 'toFolderId'],
    },
    // Moving the item back undoes it, and moving it to the same folder twice changes nothing more.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { itemId, toFolderId } = args as { itemId: string; toFolderId: string };
      validateNonEmpty(itemId, 'itemId');
      validateNonEmpty(toFolderId, 'toFolderId');

      await canvaRequest(ctx, '/folders/move', {
        method: 'POST',
        body: { item_id: itemId, to_folder_id: toFolderId },
      });
      return { itemId, toFolderId, moved: true };
    },
  });
}
