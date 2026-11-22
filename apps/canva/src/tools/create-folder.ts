import type { AgentApp } from '@agentapps/sdk';
import { buildFolderShape, canvaRequest } from '../lib/index.js';
import { FOLDER_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

export function registerCreateFolderTool(app: AgentApp): void {
  app.tool('create-folder', {
    description:
      'Create a new folder under a parent. Use parentFolderId="root" for top level. Returns curated folder. Not retryable. Params: name, parentFolderId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Folder name.' },
        parentFolderId: { type: 'string', description: 'Parent folder ID ("root" for top level).' },
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
      required: ['name', 'parentFolderId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { name, parentFolderId, fields, includeRaw } = args as {
        name: string;
        parentFolderId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(name, 'name');
      validateNonEmpty(parentFolderId, 'parentFolderId');

      const raw = await canvaRequest(ctx, '/folders', {
        method: 'POST',
        body: { name, parent_folder_id: parentFolderId },
      });
      const shape = buildFolderShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: FOLDER_FIELDS,
      });
    },
  });
}
