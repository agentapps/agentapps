import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, rangeRef } from '../lib/index.js';

/** delete-rows-or-columns — POST {range}/delete. */
export function registerDeleteRowsOrColumnsTool(app: AgentApp): void {
  app.tool('delete-rows-or-columns', {
    description:
      'Delete rows or columns at a range, shifting the surviving cells to close the gap. This cannot be undone by this app.',
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
            'What to delete, in A1 notation. "5:6" deletes rows 5 and 6; "B:B" deletes column B.',
        },
        direction: {
          type: 'string',
          description: 'What to delete: "rows" or "columns".',
        },
      },
      required: ['worksheet', 'address', 'direction'],
    },
    annotations: {
      readOnlyHint: false,
      // The app cannot restore deleted cells.
      destructiveHint: true,
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

      const shift = direction === 'rows' ? 'Up' : 'Left';
      await graphRequest('POST', `${rangeRef(a)}/delete`, { shift });

      return { success: true, account: email, address: a.address as string, direction, shift };
    },
  });
}
