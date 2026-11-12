import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerBatchUpdateTool(app: AgentApp): void {
  app.tool('batch-update', {
    description:
      'Execute advanced operations on a Google Spreadsheet using the Sheets API batchUpdate endpoint. Supports: adding/deleting/renaming sheets, cell formatting (bold, colors, borders, number format), conditional formatting, formulas, frozen rows/columns, data validation, protected ranges, and more. Pass an array of request objects following the Google Sheets API batchUpdate schema.',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The ID of the spreadsheet',
        },
        requests: {
          type: 'array',
          description:
            'Array of batchUpdate request objects. Each object is a key mapped to its request type. ' +
            'Common types: addSheet, deleteSheet, updateSheetProperties (rename, tabColor, gridProperties like frozenRowCount), ' +
            'repeatCell (formatting: textFormat with bold/italic/fontSize/foregroundColor, backgroundColor, numberFormat, borders), ' +
            'addConditionalFormatRule, setDataValidation, addProtectedRange, autoResizeDimensions, ' +
            'updateBorders, mergeCells, unmergeCells, addChart, addPivotTable. ' +
            'See https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/request for full schema.',
          items: {
            type: 'object',
          },
        },
      },
      required: ['spreadsheetId', 'requests'],
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

      const { spreadsheetId, requests } = (args ?? {}) as {
        spreadsheetId: string;
        requests: unknown[];
      };

      if (!requests || requests.length === 0) {
        return {
          success: false,
          message: 'No requests provided',
        };
      }

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: requests as object[] },
          });

          return {
            success: true,
            replies: response.data.replies,
            spreadsheetId,
            operationsPerformed: requests.length,
          };
        },
        'batch-update',
      );
    },
  });
}
