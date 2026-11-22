import type { AgentApp } from '@agentapps/sdk';
import { figmaRequest } from '../lib/index.js';
import {
  extractTypographyFromNode,
  type FigmaFile,
  type FigmaTypeStyle,
  formatTypographyAsCss,
  formatTypographyAsTailwind,
} from './_helpers.js';
import { validateFileKey } from './utils.js';

const VALID_FORMATS = ['css', 'tailwind', 'json'] as const;
type TypographyFormat = (typeof VALID_FORMATS)[number];

export function registerExtractTypographyTool(app: AgentApp): void {
  app.tool('extract-typography', {
    description:
      'Extract typography styles (font family, size, weight, line height, letter spacing) from TEXT nodes. Returns { count, output, format }. Params: fileKey, format? (default css).',
    parameters: {
      type: 'object',
      properties: {
        fileKey: { type: 'string', description: 'The file key from a Figma URL.' },
        format: {
          type: 'string',
          enum: ['css', 'tailwind', 'json'],
          description: 'Output format. Default css.',
        },
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
      const { fileKey, format } = args as { fileKey: string; format?: TypographyFormat };

      const safeKey = validateFileKey(fileKey);
      const safeFormat: TypographyFormat =
        format && VALID_FORMATS.includes(format) ? format : 'css';

      const file = await figmaRequest<FigmaFile>(`/files/${safeKey}?depth=100`, ctx);

      const styles = new Map<string, FigmaTypeStyle>();
      extractTypographyFromNode(file.document, styles);
      const styleArray = Array.from(styles.values());

      let output: string;
      if (safeFormat === 'css') output = formatTypographyAsCss(styleArray);
      else if (safeFormat === 'tailwind') output = formatTypographyAsTailwind(styleArray);
      else output = JSON.stringify(styleArray, null, 2);

      return { count: styleArray.length, output, format: safeFormat };
    },
  });
}
