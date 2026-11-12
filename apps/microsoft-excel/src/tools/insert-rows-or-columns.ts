import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, rangeRef } from '../lib/index.js';

/** insert-rows-or-columns — POST {range}/insert. */
export function registerInsertRowsOrColumnsTool(app: AgentApp): void {
  app.tool('insert-rows-or-columns', {
    description:
      'Insert blank rows or columns at a range, shifting existing cells out of the way. Use a whole-row address like "3:4" or a whole-column address like "B:B" to insert entire rows or columns.',
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
          description:
            'Where to insert, in A1 notation. "3:4" inserts two rows at row 3; "B:B" inserts one column at B.',
        },
        direction: {
          type: 'string',
          description: 'What to insert: "rows" or "columns".',
        },
      },
      required: ['worksheet', 'address', 'direction'],
    },
    annotations: {
      readOnlyHint: false,
      // Inserting only shifts existing cells aside — nothing is overwritten or
      // lost, so this is not destructive.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const direction = a.direction as string;

      if (direction !== 'rows' && direction !== 'columns') {
        throw new Error('direction must be "rows" or "columns".');
      }

      const shift = direction === 'rows' ? 'Down' : 'Right';
      await graphRequest('POST', `${rangeRef(a)}/insert`, { shift });

      return { success: true, account: email, address: a.address as string, direction, shift };
    },
  });
}
