import type { AgentApp } from '@agentapps/sdk';
import { odooWrite } from '../lib/odoo-client.js';

/**
 * update-record — update an existing Odoo record by model and ID.
 */
export function registerUpdateRecordTool(app: AgentApp): void {
  app.tool('update-record', {
    description: 'Update an existing Odoo record by model and ID.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Odoo model technical name' },
        id: { type: 'number', description: 'Record ID' },
        values: {
          type: 'object',
          description: 'Field values to update',
          additionalProperties: true,
        },
      },
      required: ['model', 'id', 'values'],
    },
    // Setting the fields again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      return odooWrite(ctx, a.model as string, a.id as number, a.values as Record<string, unknown>);
    },
  });
}
