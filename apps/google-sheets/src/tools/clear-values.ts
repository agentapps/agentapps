import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerClearValuesTool(app: AgentApp): void {
  app.tool('clear-values', {
    description:
      'Clear all values from a range of cells in a Google Sheet. Only clears values, not formatting.',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The ID of the spreadsheet',
        },
        range: {
          type: 'string',
          description: 'A1 notation range to clear (e.g. "Sheet1!A1:C3" or "A1:Z100")',
        },
      },
      required: ['spreadsheetId', 'range'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
      idempotentHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { spreadsheetId, range } = (args ?? {}) as {
        spreadsheetId: string;
        range: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.sheets.spreadsheets.values.clear({
            spreadsheetId,
            range,
          });

          return {
            success: true,
            clearedRange: response.data.clearedRange,
            spreadsheetId: response.data.spreadsheetId,
          };
        },
        'clear-values',
      );
    },
  });
}
