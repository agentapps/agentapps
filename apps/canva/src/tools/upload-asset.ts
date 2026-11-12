import type { AgentApp } from '@agentapps/sdk';
import { buildAssetUploadJobShape, canvaRequest } from '../lib/index.js';
import { JOB_FIELDS } from './_fields.js';
import { validateExternalUrl, validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerUploadAssetTool(app: AgentApp): void {
  app.tool('upload-asset', {
    description:
      'Upload an asset (image, video, audio) to the user library from a public URL. Async — returns curated job (poll get-asset-upload-job by id). url must be http/https. Not retryable. Params: name, url, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name for the new asset.' },
        url: { type: 'string', description: 'Publicly accessible http/https URL of the file.' },
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
      required: ['name', 'url'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { name, url, fields, includeRaw } = args as {
        name: string;
        url: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(name, 'name');
      validateExternalUrl(url, 'url');

      const raw = await canvaRequest(ctx, '/url-asset-uploads', {
        method: 'POST',
        body: { name, url },
      });
      const shape = buildAssetUploadJobShape(raw);
      return resolveFields(shape as any, raw, { includeRaw, fields, defaultFields: JOB_FIELDS });
    },
  });
}
