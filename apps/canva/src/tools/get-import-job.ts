import type { AgentApp } from '@agentapps/sdk';
import { buildImportJobShape, canvaRequest } from '../lib/index.js';
import { JOB_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetImportJobTool(app: AgentApp): void {
  app.tool('get-import-job', {
    description:
      'Get a URL design import job status/result. Returns curated job { id, status, error, result.designId? }. Params: jobId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Job ID returned by import-design.' },
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
      required: ['jobId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { jobId, fields, includeRaw } = args as {
        jobId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(jobId, 'jobId');

      const raw = await canvaRequest(ctx, `/url-imports/${encodeURIComponent(jobId)}`);
      const shape = buildImportJobShape(raw);
      return resolveFields(shape as any, raw, { includeRaw, fields, defaultFields: JOB_FIELDS });
    },
  });
}
