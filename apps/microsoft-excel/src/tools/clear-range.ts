import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, rangeRef } from '../lib/index.js';

/** clear-range — POST {range}/clear. */
export function registerClearRangeTool(app: AgentApp): void {
  app.tool('clear-range', {
    description:
      'Clear a range: its contents, its formatting, or both. This cannot be undone by this app.',
    parameters: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'Workbook drive item ID. Takes precedence over path.',
        },
        path: {
          type: 'string',
          description:
            'Workbook path relative to the drive root. Pass literal names, not pre-encoded ones.',
        },
        worksheet: { type: 'string', description: 'Worksheet name or id' },
        address: { type: 'string', description: 'Range in A1 notation, e.g. "A1:C10".' },
        applyTo: {
          type: 'string',
          description: 'What to clear: "All" (default), "Contents", or "Formats".',
        },
      },
      required: ['worksheet', 'address'],
    },
    annotations: {
      readOnlyHint: false,
      // The app cannot restore cleared cells.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const applyTo = (a.applyTo as string) || 'All';

      await graphRequest('POST', `${rangeRef(a)}/clear`, { applyTo });

      return { success: true, account: email, address: a.address as string, applyTo };
    },
  });
}
