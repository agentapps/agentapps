import type { AgentApp } from '@agentapps/sdk';
import { assertGrid, createGraphClient, rangeRef } from '../lib/index.js';

/** write-range — PATCH {range} with values or formulas. */
export function registerWriteRangeTool(app: AgentApp): void {
  app.tool('write-range', {
    description:
      'Write cells into a worksheet range. Writes literal values by default; set formulas:true to write formula strings such as "=A1*B1". The payload shape must match the address. This app does not manage workbook sessions: each call runs as its own implicit session and there is no batching, so prefer one write over a wide range to many small ones.',
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
          description: 'Range in A1 notation, e.g. "A1:C10". Must match the shape of values.',
        },
        values: {
          type: 'array',
          description:
            'Rows of cells, e.g. [["Item","Cost"],["Widget",9.5]]. Every row must be the same length.',
          items: { type: 'array' },
        },
        formulas: {
          type: 'boolean',
          description:
            'When true, the payload is written as formulas rather than literal values (default: false).',
        },
      },
      required: ['worksheet', 'address', 'values'],
    },
    annotations: {
      readOnlyHint: false,
      // Overwrites whatever occupied the range; the app cannot restore it.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      assertGrid(a.values);

      const asFormulas = a.formulas === true;
      const body = asFormulas ? { formulas: a.values } : { values: a.values };

      const range = await graphRequest<Record<string, any>>('PATCH', rangeRef(a), body);

      return {
        success: true,
        account: email,
        wrote: asFormulas ? 'formulas' : 'values',
        address: range?.address ?? (a.address as string),
        rowCount: range?.rowCount ?? (a.values as unknown[][]).length,
        columnCount: range?.columnCount ?? (a.values as unknown[][])[0].length,
      };
    },
  });
}
