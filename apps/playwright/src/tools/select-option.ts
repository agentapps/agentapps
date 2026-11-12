import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, findElementByRef } from '../browser.js';

export function registerSelectOptionTool(app: AgentApp): void {
  app.tool('select-option', {
    description: 'Select an option in a dropdown',
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
        values: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of values to select in the dropdown. This can be a single value or multiple values.',
        },
      },
      required: ['element', 'ref', 'values'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args) => {
      const { page } = await ensureBrowser();
      const el = await findElementByRef(page, args.ref as string);

      if (!el) {
        throw new Error(`Element not found: ${args.ref}`);
      }

      await el.selectOption(args.values as string[]);
      return `Selected options in "${args.element}"`;
    },
  });
}
