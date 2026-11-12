import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, workbookRef } from '../lib/index.js';

/** calculate-workbook — POST {workbook}/application/calculate. */
export function registerCalculateWorkbookTool(app: AgentApp): void {
  app.tool('calculate-workbook', {
    description:
      'Force Excel to recalculate a workbook. Use after writing formulas if dependent cells still show stale values.',
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
        calculationType: {
          type: 'string',
          description:
            'Calculation scope: "Recalculate" (default, changed cells only), "Full", or "FullRebuild".',
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const calculationType = (a.calculationType as string) || 'Recalculate';

      await graphRequest('POST', `${workbookRef(a)}/application/calculate`, { calculationType });

      return { success: true, account: email, calculationType };
    },
  });
}
