import type { AgentApp } from '@agentapps/sdk';
import { figmaRequest } from '../lib/index.js';
import { STYLE_FIELDS } from './_fields.js';
import type { FigmaFile } from './_helpers.js';
import { resolveFieldsList, validateFileKey } from './utils.js';

export function registerGetFileStylesTool(app: AgentApp): void {
  app.tool('get-file-styles', {
    description:
      'List styles defined in a Figma file. Returns { styles: [{id, key, name, type, description}], count }. Params: fileKey, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'The file key from a Figma URL.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist per row.',
        },
        includeRaw: { type: 'boolean', description: 'Return raw upstream payload. Default false.' },
      },
      required: ['fileKey'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { fileKey, fields, includeRaw } = args as {
        fileKey: string;
        fields?: string[];
        includeRaw?: boolean;
      };

      const safeKey = validateFileKey(fileKey);
      const file = await figmaRequest<FigmaFile>(`/files/${safeKey}`, ctx);

      const rawStyles = Object.entries(file.styles ?? {}).map(([id, style]: [string, any]) => ({
        id,
        ...style,
      }));
      const shaped = rawStyles.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        type: s.styleType,
        description: s.description ?? '',
      }));

      const styles = resolveFieldsList(shaped, rawStyles, {
        includeRaw,
        fields,
        defaultFields: STYLE_FIELDS,
      });
      return { styles, count: shaped.length };
    },
  });
}
