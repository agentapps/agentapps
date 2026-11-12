import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, findElementByRef } from '../browser.js';

export function registerHoverTool(app: AgentApp): void {
  app.tool('hover', {
    description: 'Hover over element on page',
    parameters: {
      type: 'object',
      properties: {
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
      required: ['element', 'ref'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args) => {
      const { page } = await ensureBrowser();
      const el = await findElementByRef(page, args.ref as string);

      if (!el) {
        throw new Error(`Element not found: ${args.ref}`);
      }

      await el.hover();
      return `Hovered over "${args.element}"`;
    },
  });
}
