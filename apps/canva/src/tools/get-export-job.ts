import type { AgentApp } from '@agentapps/sdk';
import { buildExportJobShape, canvaRequest } from '../lib/index.js';
import { JOB_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetExportJobTool(app: AgentApp): void {
  app.tool('get-export-job', {
    description:
      'Get an export job status/result. Returns curated job { id, status, error, result.urls? }. Params: exportId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        exportId: { type: 'string', description: 'Export job ID returned by export-design.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Canva job response. Default false.',
        },
      },
      required: ['exportId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { exportId, fields, includeRaw } = args as {
        exportId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(exportId, 'exportId');

      const raw = await canvaRequest(ctx, `/exports/${encodeURIComponent(exportId)}`);
      const shape = buildExportJobShape(raw);
      return resolveFields(shape as any, raw, { includeRaw, fields, defaultFields: JOB_FIELDS });
    },
  });
}
