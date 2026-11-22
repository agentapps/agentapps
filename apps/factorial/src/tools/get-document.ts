import type { AgentApp } from '@agentapps/sdk';
import { factorialRequest } from '../lib/index.js';

export function registerGetDocumentTool(app: AgentApp): void {
  app.tool('get-document', {
    description: 'Get detailed information about a specific document by ID.',
    parameters: {
      type: 'object',
      properties: {
        documentId: { type: 'number', description: 'The document ID' },
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
      return factorialRequest(ctx, `/documents/documents/${args.documentId}`);
    },
  });
}
