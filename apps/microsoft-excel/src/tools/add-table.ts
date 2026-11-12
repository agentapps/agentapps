import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatTable, worksheetRef } from '../lib/index.js';

/** add-table — POST {worksheet}/tables/add. */
export function registerAddTableTool(app: AgentApp): void {
  app.tool('add-table', {
    description:
      'Turn a range of cells into an Excel table, so it can be appended to, sorted and filtered as a unit.',
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
          description: 'Range to convert, in A1 notation, e.g. "A1:C10".',
        },
        hasHeaders: {
          type: 'boolean',
          description: 'Whether the first row of the range holds column headers (default: true).',
        },
      },
      required: ['worksheet', 'address'],
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
      const table = await graphRequest<Record<string, unknown>>(
        'POST',
        `${worksheetRef(a)}/tables/add`,
        {
          address: a.address as string,
          hasHeaders: a.hasHeaders !== false,
        },
      );

      return { success: true, account: email, table: formatTable(table) };
    },
  });
}
