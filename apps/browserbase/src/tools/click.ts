import type { AgentApp } from '@agentapps/sdk';
import { findElement, requireSession } from '../lib/index.js';

export function registerClickTool(app: AgentApp): void {
  app.tool('click', {
    // A click on a real web page can submit, buy, send or delete: annotated for the worst case.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    description: 'Click on an element in the page.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Active session ID' },
        ref: {
          type: 'string',
          description: 'Element ref from snapshot (e.g. s1e3) or CSS selector',
        },
        element: { type: 'string', description: 'Human-readable element description' },
        button: {
          type: 'string',
          enum: ['left', 'right', 'middle'],
          description: 'Mouse button (default: left)',
        },
        doubleClick: { type: 'boolean', description: 'Perform double click' },
      },
      required: ['sessionId', 'ref', 'element'],
    },
    handler: async (args, _ctx) => {
      const { page } = requireSession(args.sessionId as string);
      const el = await findElement(page, args.ref as string);

      if (!el) throw new Error(`Element not found: ${args.ref}`);

      await el.click({
        button: (args.button as any) || 'left',
        clickCount: args.doubleClick ? 2 : 1,
      });

      return `Clicked on "${args.element}"`;
    },
  });
}
