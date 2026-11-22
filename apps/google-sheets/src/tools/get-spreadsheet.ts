import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerGetSpreadsheetTool(app: AgentApp): void {
  app.tool('get-spreadsheet', {
    description:
      'Get full metadata for a Google Spreadsheet including title, locale, sheets (tabs), named ranges, and spreadsheet URL. Does not return cell values — use read-spreadsheet or read-sheet-range for that.',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The ID of the spreadsheet',
        },
      },
      required: ['spreadsheetId'],
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

      const { spreadsheetId } = (args ?? {}) as {
        spreadsheetId: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'spreadsheetId,spreadsheetUrl,properties,sheets.properties,namedRanges',
          });

          const data = response.data;

          return {
            spreadsheetId: data.spreadsheetId,
            url: data.spreadsheetUrl,
            title: data.properties?.title,
            locale: data.properties?.locale,
            timeZone: data.properties?.timeZone,
            sheets:
              data.sheets?.map((sheet) => ({
                sheetId: sheet.properties?.sheetId,
                title: sheet.properties?.title,
                index: sheet.properties?.index,
                sheetType: sheet.properties?.sheetType,
                rowCount: sheet.properties?.gridProperties?.rowCount,
                columnCount: sheet.properties?.gridProperties?.columnCount,
                frozenRowCount: sheet.properties?.gridProperties?.frozenRowCount,
                frozenColumnCount: sheet.properties?.gridProperties?.frozenColumnCount,
              })) || [],
            namedRanges:
              data.namedRanges?.map((nr) => ({
                namedRangeId: nr.namedRangeId,
                name: nr.name,
                range: nr.range,
              })) || [],
          };
        },
        'get-spreadsheet',
      );
    },
  });
}
