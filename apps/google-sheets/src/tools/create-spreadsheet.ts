import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerCreateSpreadsheetTool(app: AgentApp): void {
  app.tool('create-spreadsheet', {
    description:
      'Create a new Google Spreadsheet with a title and optional initial data. Returns the spreadsheet ID and URL.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the new spreadsheet',
        },
        sheets: {
          type: 'array',
          description: 'Optional: names of sheets (tabs) to create. Defaults to a single "Sheet1".',
          items: { type: 'string' },
        },
      },
      required: ['title'],
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      idempotentHint: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { title, sheets: sheetNames } = (args ?? {}) as {
        title: string;
        sheets?: string[];
      };

      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new Error('title is required and must be a non-empty string.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          const requestBody: Record<string, unknown> = {
            properties: { title },
          };

          if (sheetNames && sheetNames.length > 0) {
            requestBody.sheets = sheetNames.map((name) => ({
              properties: { title: name },
            }));
          }

          const response = await clients.sheets.spreadsheets.create({
            requestBody,
          });

          const spreadsheetId = response.data.spreadsheetId!;
          const spreadsheetUrl = response.data.spreadsheetUrl!;

          return {
            spreadsheetId,
            title,
            url: spreadsheetUrl,
            sheets: response.data.sheets?.map((s) => s.properties?.title || '') || [],
          };
        },
        'create-spreadsheet',
      );
    },
  });
}
