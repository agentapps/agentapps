import type { AgentApp } from '@agentapps/sdk';
import { buildDesignPagesShape, canvaRequest } from '../lib/index.js';
import { DESIGN_PAGES_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetDesignPagesTool(app: AgentApp): void {
  app.tool('get-design-pages', {
    description:
      'Get pages of a Canva design with thumbnails (returns dimensions for bounded designs). Returns curated { pages: [{ index, thumbnailUrl, width, height }] }. Params: designId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        designId: { type: 'string', description: 'Canva design ID.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Canva pages response. Default false.',
        },
      },
      required: ['designId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { designId, fields, includeRaw } = args as {
        designId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(designId, 'designId');

      const raw = await canvaRequest(ctx, `/designs/${encodeURIComponent(designId)}/pages`);
      const shape = buildDesignPagesShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: DESIGN_PAGES_FIELDS,
      });
    },
  });
}
