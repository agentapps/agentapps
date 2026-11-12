import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, findElementByRef, resetLastActionTime } from '../browser.js';

export function registerClickTool(app: AgentApp): void {
  app.tool('click', {
    description: 'Perform click on a web page',
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
        doubleClick: {
          type: 'boolean',
          description: 'Whether to perform a double click instead of a single click',
        },
        button: {
          type: 'string',
          enum: ['left', 'right', 'middle'],
          description: 'Button to click, defaults to left',
        },
        modifiers: {
          type: 'array',
          items: { type: 'string', enum: ['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'] },
          description: 'Modifier keys to press',
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

      const clickOptions: any = {
        button: args.button || 'left',
        clickCount: args.doubleClick ? 2 : 1,
      };

      if (args.modifiers) {
        clickOptions.modifiers = args.modifiers;
      }

      resetLastActionTime();
      await el.click(clickOptions);
      return `Clicked on "${args.element}"`;
    },
  });
}
