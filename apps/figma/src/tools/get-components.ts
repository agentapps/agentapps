import type { AgentApp } from '@agentapps/sdk';
import { figmaRequest } from '../lib/index.js';
import { COMPONENT_FIELDS } from './_fields.js';
import type { FigmaFile } from './_helpers.js';
import { resolveFieldsList, validateFileKey } from './utils.js';

export function registerGetComponentsTool(app: AgentApp): void {
  app.tool('get-components', {
    description:
      'List components defined in a Figma file. Returns { components: [{id, key, name, description, componentSetId?}], count }. Params: fileKey, fields?, includeRaw.',
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

      const rawComponents = Object.entries(file.components ?? {}).map(
        ([id, comp]: [string, any]) => ({ id, ...comp }),
      );
      const shaped = rawComponents.map((c) => ({
        id: c.id,
        key: c.key,
        name: c.name,
        description: c.description ?? '',
        componentSetId: c.componentSetId,
      }));

      const components = resolveFieldsList(shaped, rawComponents, {
        includeRaw,
        fields,
        defaultFields: COMPONENT_FIELDS,
      });
      return { components, count: shaped.length };
    },
  });
}
