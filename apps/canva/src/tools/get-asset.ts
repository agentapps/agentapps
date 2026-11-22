import type { AgentApp } from '@agentapps/sdk';
import { buildAssetShape, canvaRequest } from '../lib/index.js';
import { ASSET_DETAIL_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetAssetTool(app: AgentApp): void {
  app.tool('get-asset', {
    description:
      'Get asset metadata. Returns curated { id, name, type, thumbnail*, tags, metadata, dates }. Params: assetId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'string', description: 'Canva asset ID.' },
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { assetId, fields, includeRaw } = args as {
        assetId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(assetId, 'assetId');

      const raw = await canvaRequest(ctx, `/assets/${encodeURIComponent(assetId)}`);
      const shape = buildAssetShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: ASSET_DETAIL_FIELDS,
      });
    },
  });
}
