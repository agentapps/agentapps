import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatWorksheet, workbookRef } from '../lib/index.js';

/** add-worksheet — POST {workbook}/worksheets/add. */
export function registerAddWorksheetTool(app: AgentApp): void {
  app.tool('add-worksheet', {
    description: 'Add a new worksheet to an Excel workbook.',
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
        name: {
          type: 'string',
          description: 'Name for the new worksheet. Excel assigns one if omitted.',
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const body: Record<string, unknown> = {};
      if (a.name) body.name = a.name as string;

      const worksheet = await graphRequest<Record<string, unknown>>(
        'POST',
        `${workbookRef(a)}/worksheets/add`,
        body,
      );

      return { success: true, account: email, worksheet: formatWorksheet(worksheet) };
    },
  });
}
