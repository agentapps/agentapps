import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerUpdateTextStyleTool(app: AgentApp): void {
  app.tool('update-text-style', {
    description:
      'Update text styling (bold, italic, underline, font size, font family, foreground color) for a range of text in a Google Doc. Use read-document to find the start and end indices.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document',
        },
        startIndex: {
          type: 'number',
          description:
            'Start index of the text range (inclusive). Index 1 is the start of the document.',
        },
        endIndex: {
          type: 'number',
          description: 'End index of the text range (exclusive).',
        },
        bold: {
          type: 'boolean',
          description: 'Set text to bold (true) or not bold (false)',
        },
        italic: {
          type: 'boolean',
          description: 'Set text to italic (true) or not italic (false)',
        },
        underline: {
          type: 'boolean',
          description: 'Set text to underlined (true) or not underlined (false)',
        },
        strikethrough: {
          type: 'boolean',
          description: 'Set text to strikethrough (true) or not (false)',
        },
        fontSize: {
          type: 'number',
          description: 'Font size in points (e.g. 12, 14, 18)',
        },
        fontFamily: {
          type: 'string',
          description: 'Font family name (e.g. "Arial", "Times New Roman", "Roboto")',
        },
        foregroundColor: {
          type: 'object',
          description: 'Text color as RGB values (each 0.0 to 1.0)',
          properties: {
            red: { type: 'number', description: 'Red component (0.0 to 1.0)' },
            green: { type: 'number', description: 'Green component (0.0 to 1.0)' },
            blue: { type: 'number', description: 'Blue component (0.0 to 1.0)' },
          },
        },
      },
      required: ['documentId', 'startIndex', 'endIndex'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const {
        documentId,
        startIndex,
        endIndex,
        bold,
        italic,
        underline,
        strikethrough,
        fontSize,
        fontFamily,
        foregroundColor,
      } = args as {
        documentId: string;
        startIndex: number;
        endIndex: number;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strikethrough?: boolean;
        fontSize?: number;
        fontFamily?: string;
        foregroundColor?: { red?: number; green?: number; blue?: number };
      };

      if (startIndex < 1) {
        throw new Error('startIndex must be at least 1.');
      }
      if (endIndex <= startIndex) {
        throw new Error('endIndex must be greater than startIndex.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          const textStyle: Record<string, unknown> = {};
          const fields: string[] = [];

          if (bold !== undefined) {
            textStyle.bold = bold;
            fields.push('bold');
          }
          if (italic !== undefined) {
            textStyle.italic = italic;
            fields.push('italic');
          }
          if (underline !== undefined) {
            textStyle.underline = underline;
            fields.push('underline');
          }
          if (strikethrough !== undefined) {
            textStyle.strikethrough = strikethrough;
            fields.push('strikethrough');
          }
          if (fontSize !== undefined) {
            textStyle.fontSize = {
              magnitude: fontSize,
              unit: 'PT',
            };
            fields.push('fontSize');
          }
          if (fontFamily !== undefined) {
            textStyle.weightedFontFamily = {
              fontFamily,
            };
            fields.push('weightedFontFamily');
          }
          if (foregroundColor !== undefined) {
            textStyle.foregroundColor = {
              color: {
                rgbColor: {
                  red: foregroundColor.red ?? 0,
                  green: foregroundColor.green ?? 0,
                  blue: foregroundColor.blue ?? 0,
                },
              },
            };
            fields.push('foregroundColor');
          }

          if (fields.length === 0) {
            throw new Error(
              'At least one style property must be specified (bold, italic, underline, strikethrough, fontSize, fontFamily, foregroundColor).',
            );
          }

          await clients.docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [
                {
                  updateTextStyle: {
                    range: {
                      startIndex,
                      endIndex,
                    },
                    textStyle,
                    fields: fields.join(','),
                  },
                },
              ],
            },
          });

          return {
            success: true,
            message: `Updated text style (${fields.join(', ')}) for range ${startIndex}-${endIndex}`,
          };
        },
        'update-text-style',
      );
    },
  });
}
