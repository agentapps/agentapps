import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatWorksheet, worksheetRef } from '../lib/index.js';

/** rename-worksheet — PATCH {worksheet} with a new name. */
export function registerRenameWorksheetTool(app: AgentApp): void {
  app.tool('rename-worksheet', {
    description: 'Rename a worksheet, or change its position or visibility.',
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
        worksheet: { type: 'string', description: 'Current worksheet name or id' },
        newName: { type: 'string', description: 'New name for the worksheet' },
        position: { type: 'number', description: 'Optional zero-based tab position' },
        visibility: {
          type: 'string',
          description: 'Optional visibility: "Visible", "Hidden", or "VeryHidden".',
        },
      },
      required: ['worksheet'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const body: Record<string, unknown> = {};
      if (a.newName) body.name = a.newName as string;
      if (typeof a.position === 'number') body.position = a.position;
      if (a.visibility) body.visibility = a.visibility as string;

      if (Object.keys(body).length === 0) {
        throw new Error('Specify at least one of newName, position, or visibility.');
      }

      const worksheet = await graphRequest<Record<string, unknown>>('PATCH', worksheetRef(a), body);

      return { success: true, account: email, worksheet: formatWorksheet(worksheet) };
    },
  });
}
