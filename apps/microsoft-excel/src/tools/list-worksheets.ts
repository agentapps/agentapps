import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatWorksheet, workbookRef } from '../lib/index.js';

/** list-worksheets — GET {workbook}/worksheets. */
export function registerListWorksheetsTool(app: AgentApp): void {
  app.tool('list-worksheets', {
    description: 'List every worksheet in an Excel workbook, with its position and visibility.',
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
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const response = await graphRequest<{ value?: any[] }>('GET', `${workbookRef(a)}/worksheets`);
      const worksheets = (response.value || []).map((ws) => formatWorksheet(ws));

      return { account: email, count: worksheets.length, worksheets };
    },
  });
}
