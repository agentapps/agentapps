import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatTable, workbookRef } from '../lib/index.js';

/** list-tables — GET {workbook}/tables. */
export function registerListTablesTool(app: AgentApp): void {
  app.tool('list-tables', {
    description:
      'List every Excel table in a workbook, across all worksheets. Table names address the add-table-rows tool.',
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
      },
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
      const response = await graphRequest<{ value?: any[] }>('GET', `${workbookRef(a)}/tables`);
      const tables = (response.value || []).map((t) => formatTable(t));

      return { account: email, count: tables.length, tables };
    },
  });
}
