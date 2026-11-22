import type { AgentApp } from '@agentapps/sdk';
import { canvaRequest } from '../lib/index.js';
import { validateNonEmpty } from './_validate.js';

export function registerDeleteFolderTool(app: AgentApp): void {
  app.tool('delete-folder', {
    description:
      'Delete a folder. Items in the folder are moved to the parent. Idempotent — repeated deletes return 404. Returns { folderId, deleted: true }. Params: folderId.',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'Canva folder ID.' },
      },
      required: ['folderId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { folderId } = args as { folderId: string };
      validateNonEmpty(folderId, 'folderId');
      await canvaRequest(ctx, `/folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' });
      return { folderId, deleted: true };
    },
  });
}
