import type { AgentApp } from '@agentapps/sdk';
import { odooCreate } from '../lib/odoo-client.js';

/**
 * create-record — create a new record in any Odoo model.
 */
export function registerCreateRecordTool(app: AgentApp): void {
  app.tool('create-record', {
    description: 'Create a new record in any Odoo model.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Odoo model technical name' },
        values: {
          type: 'object',
          description: 'Field values for the new record',
          additionalProperties: true,
        },
      },
      required: ['model', 'values'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      return odooCreate(ctx, a.model as string, a.values as Record<string, unknown>);
    },
  });
}
