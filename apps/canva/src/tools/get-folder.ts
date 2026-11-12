import type { AgentApp } from '@agentapps/sdk';
import { buildFolderShape, canvaRequest } from '../lib/index.js';
import { FOLDER_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerGetFolderTool(app: AgentApp): void {
  app.tool('get-folder', {
    description:
      'Get folder metadata. Returns curated { id, name, thumbnailUrl, dates }. Params: folderId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'Canva folder ID.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Canva folder response. Default false.',
        },
      },
      required: ['folderId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { folderId, fields, includeRaw } = args as {
        folderId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(folderId, 'folderId');

      const raw = await canvaRequest(ctx, `/folders/${encodeURIComponent(folderId)}`);
      const shape = buildFolderShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: FOLDER_FIELDS,
      });
    },
  });
}
