import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerDeleteSheetTool(app: AgentApp): void {
  app.tool('delete-sheet', {
    description:
      'Delete a sheet (tab) from a Google Spreadsheet by its sheet ID. Use list-sheet-tabs to find the sheet ID.',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The ID of the spreadsheet',
        },
        sheetId: {
          type: 'number',
          description: 'The numeric ID of the sheet tab to delete (not the sheet name)',
        },
      },
      required: ['spreadsheetId', 'sheetId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { spreadsheetId, sheetId } = (args ?? {}) as {
        spreadsheetId: string;
        sheetId: number;
      };

      return withAuthRetry(
        ctx,
        async () => {
          await clients.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  deleteSheet: {
                    sheetId,
                  },
                },
              ],
            },
          });

          return {
            success: true,
            spreadsheetId,
            deletedSheetId: sheetId,
          };
        },
        'delete-sheet',
      );
    },
  });
}
