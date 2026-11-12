import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerAddSheetTool(app: AgentApp): void {
  app.tool('add-sheet', {
    description:
      'Add a new sheet (tab) to an existing Google Spreadsheet. Returns the new sheet ID and properties.',
    parameters: {
      type: 'object',
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The ID of the spreadsheet',
        },
        title: {
          type: 'string',
          description: 'Title of the new sheet tab',
        },
      },
      required: ['spreadsheetId', 'title'],
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { spreadsheetId, title } = (args ?? {}) as {
        spreadsheetId: string;
        title: string;
      };

      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('title is required and must be a non-empty string.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  addSheet: {
                    properties: { title },
                  },
                },
              ],
            },
          });

          const reply = response.data.replies?.[0]?.addSheet;
          const properties = reply?.properties;

          return {
            spreadsheetId,
            sheetId: properties?.sheetId,
            title: properties?.title,
            index: properties?.index,
          };
        },
        'add-sheet',
      );
    },
  });
}
