import type { AgentApp } from '@agentapps/sdk';
import { buildDesignShape, canvaRequest } from '../lib/index.js';
import { DESIGN_DETAIL_FIELDS } from './_fields.js';
import { validateNonEmpty } from './_validate.js';
import { resolveFields } from './utils.js';

const PRESET_NAMES = ['doc', 'whiteboard', 'presentation', 'email'] as const;

export function registerCreateDesignTool(app: AgentApp): void {
  app.tool('create-design', {
    description:
      'Create a new Canva design. Use designType=custom with width+height for a custom canvas, or one of the preset names (doc, whiteboard, presentation, email). Returns curated design. Not retryable. Params: designType, title?, width?, height?, assetId?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        designType: {
          type: 'string',
          enum: ['doc', 'whiteboard', 'presentation', 'email', 'custom'],
          description: 'Preset name or "custom" with width+height.',
        },
        title: { type: 'string', description: 'Optional name for the new design.' },
        width: { type: 'number', description: 'Canvas width in pixels (custom only).' },
        height: { type: 'number', description: 'Canvas height in pixels (custom only).' },
        assetId: {
          type: 'string',
          description: 'Optional asset ID to insert into the new design.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: { type: 'boolean', description: 'Return raw Canva response. Default false.' },
      },
      required: ['designType'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { designType, title, width, height, assetId, fields, includeRaw } = args as {
        designType: string;
        title?: string;
        width?: number;
        height?: number;
        assetId?: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateNonEmpty(designType, 'designType');

      const body: Record<string, unknown> = {};
      if (title) body.title = title;
      if (assetId) body.asset_id = assetId;

      if (designType === 'custom') {
        body.design_type = {
          type: 'custom',
          width: width ?? 1080,
          height: height ?? 1080,
        };
      } else {
        if (!PRESET_NAMES.includes(designType as (typeof PRESET_NAMES)[number])) {
          throw new Error(
            `designType must be one of: ${PRESET_NAMES.join(', ')}, custom (received: ${designType}).`,
          );
        }
        body.design_type = { type: 'preset', name: designType };
      }

      const raw = await canvaRequest(ctx, '/designs', { method: 'POST', body });
      const shape = buildDesignShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: DESIGN_DETAIL_FIELDS,
      });
    },
  });
}
