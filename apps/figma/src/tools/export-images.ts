import type { AgentApp } from '@agentapps/sdk';
import { figmaRequest } from '../lib/index.js';
import { EXPORTED_IMAGE_FIELDS } from './_fields.js';
import { normalizeNodeId, resolveFieldsList, sanitizeNumber, validateFileKey } from './utils.js';

const VALID_FORMATS = ['png', 'jpg', 'svg', 'pdf'] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

export function registerExportImagesTool(app: AgentApp): void {
  app.tool('export-images', {
    description:
      'Export Figma nodes as images. Returns { images: [{nodeId, url, format, scale}] }. URLs expire in ~30 minutes. Formats: png|jpg|svg|pdf. Scale 0.01-4 (default 1). Params: fileKey, nodeIds, format?, scale?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'The file key from a Figma URL.' },
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Node IDs to export. Accepts "1-2" or "1:2".',
        },
        format: {
          type: 'string',
          enum: ['png', 'jpg', 'svg', 'pdf'],
          description: 'Export format. Default png.',
        },
        scale: { type: 'number', description: 'Scale factor (0.01-4). Default 1.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist per row.',
        },
        includeRaw: { type: 'boolean', description: 'Return raw upstream payload. Default false.' },
      },
      required: ['fileKey', 'nodeIds'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { fileKey, nodeIds, format, scale, fields, includeRaw } = args as {
        fileKey: string;
        nodeIds: string[];
        format?: ExportFormat;
        scale?: number;
        fields?: string[];
        includeRaw?: boolean;
      };

      const safeKey = validateFileKey(fileKey);
      if (!Array.isArray(nodeIds) || nodeIds.length === 0)
        throw new Error('nodeIds must be a non-empty array');

      const safeNodeIds = nodeIds.map((id, i) => {
        try {
          return normalizeNodeId(id);
        } catch (e: any) {
          throw new Error(`nodeIds[${i}]: ${e.message}`);
        }
      });

      const safeFormat: ExportFormat = format && VALID_FORMATS.includes(format) ? format : 'png';
      const safeScale = sanitizeNumber(scale, { min: 0.01, max: 4, default: 1 });

      const params = new URLSearchParams({
        ids: safeNodeIds.join(','),
        format: safeFormat,
        scale: String(safeScale),
      });
      const response = await figmaRequest<{ images: Record<string, string | null> }>(
        `/images/${safeKey}?${params.toString()}`,
        ctx,
      );

      const rawImages = Object.entries(response.images ?? {}).map(([nodeId, url]) => ({
        nodeId,
        url,
        format: safeFormat,
        scale: safeScale,
      }));
      const shaped = rawImages.filter((img) => img.url !== null) as Array<{
        nodeId: string;
        url: string;
        format: ExportFormat;
        scale: number;
      }>;

      const images = resolveFieldsList(shaped, rawImages, {
        includeRaw,
        fields,
        defaultFields: EXPORTED_IMAGE_FIELDS,
      });
      return { images, count: shaped.length, expiresInMinutes: 30 };
    },
  });
}
