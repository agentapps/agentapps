import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerCopySheetTool(app: AgentApp): void {
  app.tool('copy-sheet', {
    description:
      'Copy a sheet (tab) from one Google Spreadsheet to another. Returns the new sheet ID and title in the destination spreadsheet.',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The ID of the source spreadsheet',
        },
        sheetId: {
          type: 'number',
          description: 'The numeric ID of the sheet tab to copy',
        },
        destinationSpreadsheetId: {
          type: 'string',
          description: 'The ID of the destination spreadsheet',
        },
      },
      required: ['spreadsheetId', 'sheetId', 'destinationSpreadsheetId'],
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { spreadsheetId, sheetId, destinationSpreadsheetId } = (args ?? {}) as {
        spreadsheetId: string;
        sheetId: number;
        destinationSpreadsheetId: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.sheets.spreadsheets.sheets.copyTo({
            spreadsheetId,
            sheetId,
            requestBody: {
              destinationSpreadsheetId,
            },
          });

          return {
            sheetId: response.data.sheetId,
            title: response.data.title,
            index: response.data.index,
            destinationSpreadsheetId,
          };
        },
        'copy-sheet',
      );
    },
  });
}
