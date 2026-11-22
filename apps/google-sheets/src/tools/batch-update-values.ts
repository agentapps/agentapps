import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerBatchUpdateValuesTool(app: AgentApp): void {
  app.tool('batch-update-values', {
    description:
      'Update multiple ranges of values in a Google Sheet in a single request. More efficient than calling write-values multiple times.',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The ID of the spreadsheet',
        },
        data: {
          type: 'array',
          description:
            'Array of value range objects. Each object has a "range" (A1 notation) and "values" (2D array of cell values).',
          items: {
            type: 'object',
            properties: {
              range: {
                type: 'string',
                description: 'A1 notation range (e.g. "Sheet1!A1:C3")',
              },
              values: {
                type: 'array',
                description: '2D array of rows. Each row is an array of cell values.',
                items: {
                  type: 'array',
                  items: {},
                },
              },
            },
            required: ['range', 'values'],
          },
        },
      },
      required: ['spreadsheetId', 'data'],
    },
    // Overwrites whatever the ranges held; the app has no way to bring the old cells back.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      idempotentHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { spreadsheetId, data } = (args ?? {}) as {
        spreadsheetId: string;
        data: Array<{ range: string; values: unknown[][] }>;
      };

      if (!data || data.length === 0) {
        throw new Error('data is required and must be a non-empty array of value ranges.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
              valueInputOption: 'USER_ENTERED',
              data,
            },
          });

          return {
            success: true,
            totalUpdatedRows: response.data.totalUpdatedRows,
            totalUpdatedColumns: response.data.totalUpdatedColumns,
            totalUpdatedCells: response.data.totalUpdatedCells,
            totalUpdatedSheets: response.data.totalUpdatedSheets,
            responses: response.data.responses?.map((r) => ({
              updatedRange: r.updatedRange,
              updatedRows: r.updatedRows,
              updatedColumns: r.updatedColumns,
              updatedCells: r.updatedCells,
            })),
          };
        },
        'batch-update-values',
      );
    },
  });
}
