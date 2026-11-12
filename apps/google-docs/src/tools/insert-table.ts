import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerInsertTableTool(app: AgentApp): void {
  app.tool('insert-table', {
    description:
      'Insert a table into a Google Doc at a specific index. The table is created with the specified number of rows and columns.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document',
        },
        rows: {
          type: 'number',
          description: 'Number of rows in the table',
        },
        columns: {
          type: 'number',
          description: 'Number of columns in the table',
        },
        index: {
          type: 'number',
          description:
            'Position to insert the table at (1 = start of document). Use read-document to find positions.',
        },
      },
      required: ['documentId', 'rows', 'columns', 'index'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { documentId, rows, columns, index } = args as {
        documentId: string;
        rows: number;
        columns: number;
        index: number;
      };

      if (rows < 1) {
        throw new Error('rows must be at least 1.');
      }
      if (columns < 1) {
        throw new Error('columns must be at least 1.');
      }
      if (index < 1) {
        throw new Error('index must be at least 1.');
      }

      return withAuthRetry(
        ctx,
        async () => {
          await clients.docs.documents.batchUpdate({
            documentId,
            requestBody: {
              requests: [
                {
                  insertTable: {
                    rows,
                    columns,
                    location: {
                      index,
                    },
                  },
                },
              ],
            },
          });

          return {
            success: true,
            message: `Inserted ${rows}x${columns} table at index ${index}`,
          };
        },
        'insert-table',
      );
    },
  });
}
