import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerListSheetTabsTool(app: AgentApp): void {
  app.tool('list-sheet-tabs', {
    description: 'List all sheets (tabs) in a Google Spreadsheet with their metadata.',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'ID of the Google Sheet file',
        },
      },
      required: ['fileId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { fileId } = (args ?? {}) as { fileId: string };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.sheets.spreadsheets.get({
            spreadsheetId: fileId,
            fields: 'sheets.properties',
          });

          const sheets =
            response.data.sheets?.map((sheet) => ({
              sheetId: sheet.properties?.sheetId,
              title: sheet.properties?.title,
              index: sheet.properties?.index,
              rowCount: sheet.properties?.gridProperties?.rowCount,
              columnCount: sheet.properties?.gridProperties?.columnCount,
            })) || [];

          return { sheets };
        },
        'list-sheet-tabs',
      );
    },
  });
}
