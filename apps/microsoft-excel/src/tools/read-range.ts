import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, rangeRef } from '../lib/index.js';

/** Every field this tool returns must be selected, or Graph omits it. */
const RANGE_SELECT = 'address,values,text,formulas,numberFormat,rowCount,columnCount';

/** read-range — GET {worksheet}/range(address='…'). */
export function registerReadRangeTool(app: AgentApp): void {
  app.tool('read-range', {
    description:
      'Read a range of cells from a worksheet. Returns raw values, display text, and the underlying formulas.',
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
        address: {
          type: 'string',
          description: 'Range in A1 notation, e.g. "A1:C10" or "B2".',
        },
      },
      required: ['worksheet', 'address'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const range = await graphRequest<Record<string, any>>(
        'GET',
        `${rangeRef(a)}?$select=${RANGE_SELECT}`,
      );

      return {
        account: email,
        address: range.address,
        rowCount: range.rowCount,
        columnCount: range.columnCount,
        values: range.values,
        text: range.text,
        formulas: range.formulas,
        numberFormat: range.numberFormat,
      };
    },
  });
}
