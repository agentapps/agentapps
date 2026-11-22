import type { AgentApp } from '@agentapps/sdk';
import { odooCallMethod } from '../lib/odoo-client.js';

/**
 * call-method — call any public method on an Odoo model.
 */
export function registerCallMethodTool(app: AgentApp): void {
  app.tool('call-method', {
    description: 'Call any public method on an Odoo model.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Odoo model technical name' },
        method: { type: 'string', description: 'Method name to call' },
        args: {
          type: 'array',
          description: 'Positional arguments passed to the method',
          items: {},
        },
        kwargs: {
          type: 'object',
          description: 'Keyword arguments passed to the method',
          additionalProperties: true,
        },
      },
      required: ['model', 'method'],
    },
    // Any method of any model: it can unlink records, confirm orders or send mail. Worst case.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      return odooCallMethod(
        ctx,
        a.model as string,
        a.method as string,
        (a.args as unknown[]) ?? [],
        (a.kwargs as Record<string, unknown>) ?? {},
      );
    },
  });
}
