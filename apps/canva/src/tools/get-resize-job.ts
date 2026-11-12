import type { AgentApp } from '@agentapps/sdk';
import { buildResizeJobShape, canvaRequest } from '../lib/index.js';
import { JOB_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetResizeJobTool(app: AgentApp): void {
  app.tool('get-resize-job', {
    description:
      'Get a resize job status/result. Returns curated job { id, status, error, result: design? }. Params: jobId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Job ID returned by create-resize-job.' },
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

      const raw = await canvaRequest(ctx, `/resizes/${encodeURIComponent(jobId)}`);
      const shape = buildResizeJobShape(raw);
      return resolveFields(shape as any, raw, { includeRaw, fields, defaultFields: JOB_FIELDS });
    },
  });
}
