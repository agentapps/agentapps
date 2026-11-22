import type { AgentApp } from '@agentapps/sdk';
import { findElement, requireSession } from '../lib/index.js';

export function registerEvaluateTool(app: AgentApp): void {
  app.tool('evaluate', {
    // Runs arbitrary JavaScript in a real web page with the session's logins: it can do anything
    // the page can, including requests that cannot be undone.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    description: 'Execute JavaScript in the page context.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Active session ID' },
        function: {
          type: 'string',
          description: '() => { /* code */ } or (element) => { /* code */ } when ref is provided',
        },
        ref: { type: 'string', description: 'Optional element ref to pass as argument' },
        element: {
          type: 'string',
          description: 'Human-readable element description (if using ref)',
        },
      },
      required: ['sessionId', 'function'],
    },
    handler: async (args, _ctx) => {
      const { page } = requireSession(args.sessionId as string);
      const fn = args.function as string;

      if (args.ref) {
        const el = await findElement(page, args.ref as string);
        if (!el) throw new Error(`Element not found: ${args.ref}`);
        const result = await el.evaluate(new Function('element', `return (${fn})(element)`) as any);
        return JSON.stringify(result, null, 2);
      }

      const result = await page.evaluate(new Function(`return (${fn})()`) as any);
      return JSON.stringify(result, null, 2);
    },
  });
}
