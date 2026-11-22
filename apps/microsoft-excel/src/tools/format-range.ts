import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, rangeRef } from '../lib/index.js';

/**
 * format-range — number format is a property of the range itself; font, fill
 * and alignment live under the range's /format child. A call that touches both
 * therefore issues two requests.
 */
export function registerFormatRangeTool(app: AgentApp): void {
  app.tool('format-range', {
    description:
      'Apply number formatting and cell styling to a range: currency or date formats, bold, italic, font size and colour, fill colour, and alignment.',
    parameters: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'Workbook drive item ID. Takes precedence over path.',
        },
        path: {
          type: 'string',
          description:
            'Workbook path relative to the drive root. Pass literal names, not pre-encoded ones.',
        },
        worksheet: { type: 'string', description: 'Worksheet name or id' },
        address: { type: 'string', description: 'Range in A1 notation, e.g. "B2:B10".' },
        numberFormat: {
          type: 'string',
          description:
            'Excel number format applied to every cell in the range, e.g. "$#,##0.00", "0.0%", "yyyy-mm-dd".',
        },
        bold: { type: 'boolean', description: 'Bold text' },
        italic: { type: 'boolean', description: 'Italic text' },
        fontSize: { type: 'number', description: 'Font size in points' },
        fontColor: { type: 'string', description: 'Font colour as a hex string, e.g. "#C00000"' },
        fillColor: {
          type: 'string',
          description: 'Cell background colour as a hex string, e.g. "#FFF2CC"',
        },
        horizontalAlignment: {
          type: 'string',
          description: 'Horizontal alignment: "General", "Left", "Center", "Right".',
        },
      },
      required: ['worksheet', 'address'],
    },
    annotations: {
      readOnlyHint: false,
      // Overwrites existing formatting, which the app cannot restore.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const base = rangeRef(a);

      const font: Record<string, unknown> = {};
      if (typeof a.bold === 'boolean') font.bold = a.bold;
      if (typeof a.italic === 'boolean') font.italic = a.italic;
      if (typeof a.fontSize === 'number') font.size = a.fontSize;
      if (a.fontColor) font.color = a.fontColor as string;

      const format: Record<string, unknown> = {};
      if (Object.keys(font).length > 0) format.font = font;
      if (a.fillColor) format.fill = { color: a.fillColor as string };
      if (a.horizontalAlignment) format.horizontalAlignment = a.horizontalAlignment as string;

      const hasNumberFormat = typeof a.numberFormat === 'string';
      if (!hasNumberFormat && Object.keys(format).length === 0) {
        throw new Error(
          'Specify at least one of numberFormat, bold, italic, fontSize, fontColor, fillColor, or horizontalAlignment.',
        );
      }

      const applied: string[] = [];

      if (hasNumberFormat) {
        // Graph expects a 2D array of number formats mirroring the range's
        // dimensions, not a single value — look up the range's shape first
        // so the array is sized to match it.
        const dims = await graphRequest<Record<string, unknown>>(
          'GET',
          `${base}?$select=rowCount,columnCount`,
        );
        const rowCount = typeof dims.rowCount === 'number' ? dims.rowCount : undefined;
        const columnCount = typeof dims.columnCount === 'number' ? dims.columnCount : undefined;

        const numberFormatGrid =
          rowCount !== undefined && columnCount !== undefined
            ? Array.from({ length: rowCount }, () =>
                Array.from({ length: columnCount }, () => a.numberFormat as string),
              )
            : // Dimensions weren't reported — fall back to a single-cell
              // array rather than crashing.
              [[a.numberFormat as string]];

        await graphRequest('PATCH', base, { numberFormat: numberFormatGrid });
        applied.push('numberFormat');
      }

      if (Object.keys(format).length > 0) {
        try {
          await graphRequest('PATCH', `${base}/format`, format);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(
            applied.length > 0
              ? `Number format was applied, but styling failed: ${message}`
              : `Styling failed: ${message}`,
          );
        }
        applied.push(...Object.keys(format));
      }

      return { success: true, account: email, address: a.address as string, applied };
    },
  });
}
