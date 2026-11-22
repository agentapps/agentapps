import type { AgentApp } from '@agentapps/sdk';
import { ensureAuthenticated, initializeGoogleClients, withAuthRetry } from '../lib/index.js';

export function registerGetNamedRangesTool(app: AgentApp): void {
  app.tool('get-named-ranges', {
    description:
      'Get all named ranges in a Google Doc. Named ranges are bookmarks that mark specific content regions by name.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The ID of the document',
        },
        name: {
          type: 'string',
          description: 'Optional filter: only return named ranges with this exact name',
        },
      },
      required: ['documentId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const clients = await initializeGoogleClients(ctx);
      await ensureAuthenticated(ctx);

      const { documentId, name } = args as {
        documentId: string;
        name?: string;
      };

      return withAuthRetry(
        ctx,
        async () => {
          const response = await clients.docs.documents.get({
            documentId,
          });

          const namedRanges = response.data.namedRanges || {};
          const results: Array<{
            name: string;
            namedRangeId: string;
            ranges: Array<{ startIndex: number; endIndex: number }>;
          }> = [];

          for (const [rangeName, rangeData] of Object.entries(namedRanges)) {
            if (name && rangeName !== name) {
              continue;
            }

            for (const nr of rangeData.namedRanges || []) {
              results.push({
                name: nr.name || rangeName,
                namedRangeId: nr.namedRangeId || '',
                ranges: (nr.ranges || []).map((r) => ({
                  startIndex: r.startIndex || 0,
                  endIndex: r.endIndex || 0,
                })),
              });
            }
          }

          return {
            documentId,
            namedRanges: results,
            count: results.length,
          };
        },
        'get-named-ranges',
      );
    },
  });
}
