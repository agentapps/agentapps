import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, findElementByRef } from '../browser.js';

export function registerEvaluateTool(app: AgentApp): void {
  app.tool('evaluate', {
    description: 'Evaluate JavaScript expression on page or element',
    parameters: {
      type: 'object',
      properties: {
        function: {
          type: 'string',
          description:
            '() => { /* code */ } or (element) => { /* code */ } when element is provided',
        },
        element: {
          type: 'string',
          description:
            'Human-readable element description used to obtain permission to interact with the element',
        },
        ref: {
          type: 'string',
          description: 'Exact target element reference from the page snapshot',
        },
      },
      required: ['function'],
    },
    // Runs arbitrary JavaScript in the page, with its session: it can post, send or delete.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args) => {
      const { page } = await ensureBrowser();
      const fn = args.function as string;

      if (args.ref) {
        const el = await findElementByRef(page, args.ref as string);
        if (!el) {
          throw new Error(`Element not found: ${args.ref}`);
        }
        const result = await el.evaluate(new Function('element', `return (${fn})(element)`) as any);
        return JSON.stringify(result, null, 2);
      }

      const result = await page.evaluate(new Function(`return (${fn})()`) as any);
      return JSON.stringify(result, null, 2);
    },
  });
}
