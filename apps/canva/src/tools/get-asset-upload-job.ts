import type { AgentApp } from '@agentapps/sdk';
import { buildAssetUploadJobShape, canvaRequest } from '../lib/index.js';
import { JOB_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetAssetUploadJobTool(app: AgentApp): void {
  app.tool('get-asset-upload-job', {
    description:
      'Get an asset URL upload job status/result. Returns curated job { id, status, error, result: {asset shape with thumbnailUrl}? }. Params: jobId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Job ID returned by upload-asset.' },
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

      const raw = await canvaRequest(ctx, `/url-asset-uploads/${encodeURIComponent(jobId)}`);
      const shape = buildAssetUploadJobShape(raw);
      return resolveFields(shape as any, raw, { includeRaw, fields, defaultFields: JOB_FIELDS });
    },
  });
}
