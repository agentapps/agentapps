import type { AgentApp } from '@agentapps/sdk';
import { buildAssetShape, type CanvaAssetShape, canvaRequest } from '../lib/index.js';
import { ASSET_DETAIL_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields, sanitiseBody } from './utils.js';

export function registerUpdateAssetTool(app: AgentApp): void {
  app.tool('update-asset', {
    description:
      'Update asset metadata (rename, retag). Idempotent — same payload yields same final state. Returns curated asset. Params: assetId, name?, tags?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'string', description: 'Canva asset ID.' },
        name: { type: 'string', description: 'New display name.' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replace tags wholesale (Canva PATCH semantics).',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Canva asset response. Default false.',
        },
      },
      required: ['assetId'],
    },
    // Setting the name and tags again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { assetId, name, tags, fields, includeRaw } = args as {
        assetId: string;
        name?: string;
        tags?: string[];
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(assetId, 'assetId');

      const body = sanitiseBody({ name, tags }, { stripNull: true });
      const raw = await canvaRequest(ctx, `/assets/${encodeURIComponent(assetId)}`, {
        method: 'PATCH',
        body,
      });
      const shape: CanvaAssetShape = buildAssetShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: ASSET_DETAIL_FIELDS,
      });
    },
  });
}
