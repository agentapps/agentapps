import type { AgentApp } from '@agentapps/sdk';
import { canvaRequest } from '../lib/index.js';
import { validateNonEmpty } from './_validate.js';

export function registerDeleteAssetTool(app: AgentApp): void {
  app.tool('delete-asset', {
    description:
      'Delete an asset (moved to trash). Idempotent — repeated deletes return 404 (already deleted). Returns { assetId, deleted: true }. Params: assetId.',
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'string', description: 'Canva asset ID.' },
      },
      required: ['assetId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { assetId } = args as { assetId: string };
      validateNonEmpty(assetId, 'assetId');
      await canvaRequest(ctx, `/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
      return { assetId, deleted: true };
    },
  });
}
