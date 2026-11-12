import type { AgentApp } from '@agentapps/sdk';
import { buildExportFormatsShape, canvaRequest } from '../lib/index.js';
import { EXPORT_FORMATS_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetDesignExportFormatsTool(app: AgentApp): void {
  app.tool('get-design-export-formats', {
    description:
      'List the export formats supported by a specific design. Use this before export-design to avoid 400 errors on unsupported formats. Returns curated { formats: string[] }. Params: designId, fields?, includeRaw.',
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
          description: 'Return raw Canva formats response. Default false.',
        },
      },
      required: ['designId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { designId, fields, includeRaw } = args as {
        designId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(designId, 'designId');

      const raw = await canvaRequest(
        ctx,
        `/designs/${encodeURIComponent(designId)}/export-formats`,
      );
      const shape = buildExportFormatsShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: EXPORT_FORMATS_FIELDS,
      });
    },
  });
}
