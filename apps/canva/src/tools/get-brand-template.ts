import type { AgentApp } from '@agentapps/sdk';
import { buildBrandTemplateShape, canvaRequest } from '../lib/index.js';
import { BRAND_TEMPLATE_DETAIL_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetBrandTemplateTool(app: AgentApp): void {
  app.tool('get-brand-template', {
    description:
      'Get brand template metadata. Returns curated detail (id, title, thumbnailUrl, viewUrl, createUrl, dates). Params: brandTemplateId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        brandTemplateId: { type: 'string', description: 'Canva brand template ID.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: { type: 'boolean', description: 'Return raw Canva response. Default false.' },
      },
      required: ['brandTemplateId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { brandTemplateId, fields, includeRaw } = args as {
        brandTemplateId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(brandTemplateId, 'brandTemplateId');

      const raw = await canvaRequest(
        ctx,
        `/brand-templates/${encodeURIComponent(brandTemplateId)}`,
      );
      const shape = buildBrandTemplateShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: BRAND_TEMPLATE_DETAIL_FIELDS,
      });
    },
  });
}
