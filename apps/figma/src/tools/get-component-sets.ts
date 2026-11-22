import type { AgentApp } from '@agentapps/sdk';
import { figmaRequest } from '../lib/index.js';
import { COMPONENT_SET_FIELDS } from './_fields.js';
import type { FigmaFile } from './_helpers.js';
import { resolveFieldsList, validateFileKey } from './utils.js';

export function registerGetComponentSetsTool(app: AgentApp): void {
  app.tool('get-component-sets', {
    description:
      'List component sets (variant groups) defined in a Figma file. Returns { componentSets: [{id, key, name, description}], count }. Params: fileKey, fields?, includeRaw.',
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { fileKey, fields, includeRaw } = args as {
        fileKey: string;
        fields?: string[];
        includeRaw?: boolean;
      };

      const safeKey = validateFileKey(fileKey);
      const file = await figmaRequest<FigmaFile>(`/files/${safeKey}`, ctx);

      const rawSets = Object.entries(file.componentSets ?? {}).map(([id, set]: [string, any]) => ({
        id,
        ...set,
      }));
      const shaped = rawSets.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        description: s.description ?? '',
      }));

      const componentSets = resolveFieldsList(shaped, rawSets, {
        includeRaw,
        fields,
        defaultFields: COMPONENT_SET_FIELDS,
      });
      return { componentSets, count: shaped.length };
    },
  });
}
