import type { AgentApp } from '@agentapps/sdk';
import { buildImportJobShape, canvaRequest } from '../lib/index.js';
import { JOB_FIELDS } from './_fields.js';
import { validateExternalUrl, validateNonEmpty } from './_validate.js';
import { resolveFields, sanitiseBody } from './utils.js';

export function registerImportDesignTool(app: AgentApp): void {
  app.tool('import-design', {
    description:
      'Import an external file (e.g. PDF, PPTX, DOCX) as a new Canva design. Async — returns curated job (poll get-import-job by id). url must be http/https. Not retryable. Params: title, url, mimeType?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title for the imported design.' },
        url: {
          type: 'string',
          description: 'Publicly accessible http/https URL of the source file.',
        },
        mimeType: { type: 'string', description: 'Optional MIME type override.' },
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
      required: ['title', 'url'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { title, url, mimeType, fields, includeRaw } = args as {
        title: string;
        url: string;
        mimeType?: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(title, 'title');
      validateExternalUrl(url, 'url');

      const body = sanitiseBody({ title, url, mime_type: mimeType });
      const raw = await canvaRequest(ctx, '/url-imports', { method: 'POST', body });
      const shape = buildImportJobShape(raw);
      return resolveFields(shape as any, raw, { includeRaw, fields, defaultFields: JOB_FIELDS });
    },
  });
}
