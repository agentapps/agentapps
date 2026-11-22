import type { AgentApp } from '@agentapps/sdk';
import { buildAutofillJobShape, canvaRequest } from '../lib/index.js';
import { JOB_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetAutofillJobTool(app: AgentApp): void {
  app.tool('get-autofill-job', {
    description:
      'Get an autofill job status/result. Returns curated job { id, status, error, result: design? }. Params: jobId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Job ID returned by autofill-design.' },
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { jobId, fields, includeRaw } = args as {
        jobId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(jobId, 'jobId');

      const raw = await canvaRequest(ctx, `/autofills/${encodeURIComponent(jobId)}`);
      const shape = buildAutofillJobShape(raw);
      return resolveFields(shape as any, raw, { includeRaw, fields, defaultFields: JOB_FIELDS });
    },
  });
}
