import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerReadSpreadsheetTool(app: AgentApp): void {
  app.tool('read-spreadsheet', {
    description: 'Read data from a Google Sheet.',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The ID of the spreadsheet',
        },
        range: {
          type: 'string',
          description: "The range to read (e.g., 'Sheet1!A1:D10', default: first sheet)",
          default: 'A1:Z1000',
        },
      },
      required: ['spreadsheetId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { spreadsheetId, range = 'A1:Z1000' } = (args ?? {}) as {
        spreadsheetId: string;
        range?: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
          });

          return {
            range: response.data.range,
            values: response.data.values || [],
          };
        },
        'read-spreadsheet',
      );
    },
  });
}
