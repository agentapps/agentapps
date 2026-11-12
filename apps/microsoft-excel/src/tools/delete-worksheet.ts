import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, worksheetRef } from '../lib/index.js';

/** delete-worksheet — DELETE {worksheet}. */
export function registerDeleteWorksheetTool(app: AgentApp): void {
  app.tool('delete-worksheet', {
    description:
      'Delete a worksheet and everything on it. This cannot be undone by this app — the workbook must be restored from OneDrive version history.',
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
        worksheet: { type: 'string', description: 'Worksheet name or id to delete' },
      },
      required: ['worksheet'],
    },
    annotations: {
      readOnlyHint: false,
      // The app cannot restore a deleted worksheet.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      await graphRequest('DELETE', worksheetRef(a));

      return {
        success: true,
        account: email,
        message: 'Worksheet deleted. Recover it from OneDrive version history if needed.',
      };
    },
  });
}
