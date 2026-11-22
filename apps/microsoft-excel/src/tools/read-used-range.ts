import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, worksheetRef } from '../lib/index.js';

/**
 * Every field this tool returns must be selected, and nothing else.
 * `numberFormat` is deliberately absent: this is the survey tool, and a
 * parallel format grid over a whole populated sheet doubles the payload for
 * something the caller can get from read-range on the range it cares about.
 */
const RANGE_SELECT = 'address,values,text,formulas,rowCount,columnCount';

/** read-used-range — GET {worksheet}/usedRange. */
export function registerReadUsedRangeTool(app: AgentApp): void {
  app.tool('read-used-range', {
    description:
      'Read every populated cell on a worksheet without knowing its extent in advance. Use this to survey a sheet before reading specific ranges.',
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
        valuesOnly: {
          type: 'boolean',
          description:
            'When true, ignore cells that carry only formatting, so the range covers just cells with values.',
        },
      },
      required: ['worksheet'],
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
      const used = a.valuesOnly === true ? 'usedRange(valuesOnly=true)' : 'usedRange';

      const range = await graphRequest<Record<string, any>>(
        'GET',
        `${worksheetRef(a)}/${used}?$select=${RANGE_SELECT}`,
      );

      return {
        account: email,
        address: range.address,
        rowCount: range.rowCount,
        columnCount: range.columnCount,
        values: range.values,
        text: range.text,
        formulas: range.formulas,
      };
    },
  });
}
