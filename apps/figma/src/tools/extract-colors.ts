import type { AgentApp } from '@agentapps/sdk';
import { figmaRequest } from '../lib/index.js';
import {
  extractColorsFromNode,
  type FigmaColor,
  type FigmaFile,
  type FigmaNode,
  formatColorsAsCss,
  formatColorsAsTailwind,
} from './_helpers.js';
import { normalizeNodeId, validateFileKey } from './utils.js';

const VALID_FORMATS = ['css', 'tailwind', 'json'] as const;
type ColorFormat = (typeof VALID_FORMATS)[number];

export function registerExtractColorsTool(app: AgentApp): void {
  app.tool('extract-colors', {
    description:
      'Extract solid colors from a file or node, formatted for CSS variables, Tailwind config, or JSON. Returns { count, output, format }. Params: fileKey, nodeId?, format? (default css).',
    parameters: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'The file key from a Figma URL.' },
        nodeId: { type: 'string', description: 'Optional: scope extraction to a single node.' },
        format: {
          type: 'string',
          enum: ['css', 'tailwind', 'json'],
          description: 'Output format. Default css.',
        },
      },
      required: ['fileKey'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { fileKey, nodeId, format } = args as {
        fileKey: string;
        nodeId?: string;
        format?: ColorFormat;
      };

      const safeKey = validateFileKey(fileKey);
      const safeFormat: ColorFormat = format && VALID_FORMATS.includes(format) ? format : 'css';

      let document: FigmaNode;

      if (nodeId) {
        const safeNodeId = normalizeNodeId(nodeId);
        const response = await figmaRequest<{
          nodes: Record<string, { document: FigmaNode } | null>;
        }>(`/files/${safeKey}/nodes?ids=${encodeURIComponent(safeNodeId)}&depth=100`, ctx);
        const nodeData = response.nodes[safeNodeId];
        if (!nodeData) throw new Error(`Node ${nodeId} not found in file ${fileKey}`);
        document = nodeData.document;
      } else {
        const file = await figmaRequest<FigmaFile>(`/files/${safeKey}?depth=100`, ctx);
        document = file.document;
      }

      const colors = new Map<string, FigmaColor>();
      extractColorsFromNode(document, colors);
      const hexList = Array.from(colors.keys());

      let output: string;
      if (safeFormat === 'css') output = formatColorsAsCss(hexList);
      else if (safeFormat === 'tailwind') output = formatColorsAsTailwind(hexList);
      else output = JSON.stringify(hexList, null, 2);

      return { count: hexList.length, output, format: safeFormat };
    },
  });
}
