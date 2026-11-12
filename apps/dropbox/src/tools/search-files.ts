import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerSearchFilesTool(app: AgentApp): void {
  app.tool('search-files', {
    description: 'Search for files and folders in Dropbox by name or content.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query string.',
        },
        options: {
          type: 'object',
          description: 'Optional search options.',
          properties: {
            path: {
              type: 'string',
              description: 'Restrict search to this folder path.',
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results (default: 20, max: 1000).',
            },
            file_categories: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Filter by file category: "image", "document", "pdf", "spreadsheet", "presentation", "audio", "video", "folder", "paper", "others".',
            },
          },
        },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { query, options } = args as {
        query: string;
        options?: {
          path?: string;
          max_results?: number;
          file_categories?: string[];
        };
      };

      const body: Record<string, unknown> = { query };
      if (options) {
        body.options = options;
      }

      const result = await dropboxRequest('files/search_v2', body, ctx);

      return result;
    },
  });
}
