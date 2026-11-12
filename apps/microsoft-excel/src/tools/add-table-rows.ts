import type { AgentApp } from '@agentapps/sdk';
import { assertGrid, createGraphClient, workbookRef } from '../lib/index.js';

/** add-table-rows — POST {workbook}/tables/{table}/rows/add. */
export function registerAddTableRowsTool(app: AgentApp): void {
  app.tool('add-table-rows', {
    description:
      'Append rows to an Excel table. The table grows automatically — no need to find the next free row.',
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
        table: {
          type: 'string',
          description:
            'Table name or id, as returned by list-tables. Pass the literal name, not a pre-encoded one.',
        },
        values: {
          type: 'array',
          description:
            'Rows to append, e.g. [["Widget",9.5],["Gadget",12]]. Each row must have one cell per table column.',
          items: { type: 'array' },
        },
        index: {
          type: 'number',
          description:
            'Optional zero-based position to insert at. Appends to the end when omitted.',
        },
      },
      required: ['table', 'values'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      // `required` in the JSON schema is declarative only — nothing validates
      // arguments before the handler runs, and an undefined `table` would
      // otherwise interpolate the literal string "undefined" into the path.
      if (typeof a.table !== 'string' || !a.table.trim()) {
        throw new Error('Specify table — its name or id, as returned by list-tables.');
      }
      assertGrid(a.values, '[["Widget",9.5]]');

      const table = encodeURIComponent(a.table);
      const body: Record<string, unknown> = { values: a.values };
      if (typeof a.index === 'number') body.index = a.index;

      const added = await graphRequest<Record<string, any>>(
        'POST',
        `${workbookRef(a)}/tables/${table}/rows/add`,
        body,
      );

      return {
        success: true,
        account: email,
        table: a.table,
        rowsAdded: (a.values as unknown[][]).length,
        index: added?.index,
      };
    },
  });
}
