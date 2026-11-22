import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerWriteValuesTool(app: AgentApp): void {
  app.tool('write-values', {
    description:
      'Write data to a specific range in a Google Sheet. Overwrites existing values. Pass a 2D array of rows (each row is an array of cell values). Supports formulas (strings starting with =).',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The ID of the spreadsheet',
        },
        range: {
          type: 'string',
          description: 'A1 notation range to write to (e.g. "Sheet1!A1:C3" or "A1:C3")',
        },
        values: {
          type: 'array',
          description:
            '2D array of rows. Each row is an array of cell values (string, number, or boolean).',
          items: {
            type: 'array',
            items: {},
          },
        },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
    // Overwrites whatever the range held; the app has no way to bring the old cells back.
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

      const { spreadsheetId, range, values } = (args ?? {}) as {
        spreadsheetId: string;
        range: string;
        values: unknown[][];
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values,
            },
          });

          return {
            success: true,
            updatedRange: response.data.updatedRange,
            updatedRows: response.data.updatedRows,
            updatedColumns: response.data.updatedColumns,
            updatedCells: response.data.updatedCells,
          };
        },
        'write-values',
      );
    },
  });
}
