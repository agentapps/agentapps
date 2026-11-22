import type { AgentApp } from '@agentapps/sdk';
import { buildQueryString, factorialRequest } from '../lib/index.js';

export function registerListDocumentsTool(app: AgentApp): void {
  app.tool('list-documents', {
    description: 'List all company documents with optional filters.',
    parameters: {
      type: 'object',
      properties: {
        employeeIds: {
          type: 'array',
          items: { type: 'number' },
          description: 'Filter by employee IDs',
        },
        folderId: { type: 'number', description: 'Filter by folder ID' },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const qs = buildQueryString({
        employee_ids: args.employeeIds,
        folder_id: args.folderId,
        limit: args.limit,
        offset: args.offset,
      });
      return factorialRequest(ctx, `/documents/documents${qs}`);
    },
  });
}
