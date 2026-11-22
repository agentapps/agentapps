import type { AgentApp } from '@agentapps/sdk';
import { buildFolderShape, type CanvaFolderShape, canvaRequest } from '../lib/index.js';
import { FOLDER_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields, sanitiseBody } from './utils.js';

export function registerUpdateFolderTool(app: AgentApp): void {
  app.tool('update-folder', {
    description:
      'Rename a folder. Idempotent. Returns curated folder. Params: folderId, name, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        folderId: { type: 'string', description: 'Canva folder ID.' },
        name: { type: 'string', description: 'New folder name.' },
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
      required: ['folderId', 'name'],
    },
    // Renaming again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { folderId, name, fields, includeRaw } = args as {
        folderId: string;
        name: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(folderId, 'folderId');
      validateNonEmpty(name, 'name');

      const body = sanitiseBody({ name }, { stripNull: true });
      const raw = await canvaRequest(ctx, `/folders/${encodeURIComponent(folderId)}`, {
        method: 'PATCH',
        body,
      });
      const shape: CanvaFolderShape = buildFolderShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: FOLDER_FIELDS,
      });
    },
  });
}
