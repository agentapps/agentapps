import type { AgentApp } from '@agentapps/sdk';
import { buildDesignShape, canvaRequest } from '../lib/index.js';
import { DESIGN_DETAIL_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetDesignTool(app: AgentApp): void {
  app.tool('get-design', {
    description:
      'Get a Canva design by ID. Returns curated detail (id, title, ownerUserId/teamId, thumbnail*, edit/view URLs, pageCount, dates). Params: designId, fields?, includeRaw.',
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
          description: 'Return raw Canva design response. Default false.',
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

      const raw = await canvaRequest(ctx, `/designs/${encodeURIComponent(designId)}`);
      const shape = buildDesignShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: DESIGN_DETAIL_FIELDS,
      });
    },
  });
}
