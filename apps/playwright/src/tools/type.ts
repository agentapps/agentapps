import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, findElementByRef, resetLastActionTime } from '../browser.js';

export function registerTypeTool(app: AgentApp): void {
  app.tool('type', {
    description: 'Type text into editable element',
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
        text: { type: 'string', description: 'Text to type into the element' },
        submit: {
          type: 'boolean',
          description: 'Whether to submit entered text (press Enter after)',
        },
        slowly: {
          type: 'boolean',
          description:
            'Whether to type one character at a time. Useful for triggering key handlers in the page. By default entire text is filled in at once.',
        },
      },
      required: ['element', 'ref', 'text'],
    },
    // Types into a live web page and, with `submit`, presses Enter: it can send a form.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args) => {
      const { page } = await ensureBrowser();
      const el = await findElementByRef(page, args.ref as string);

      if (!el) {
        throw new Error(`Element not found: ${args.ref}`);
      }

      resetLastActionTime();

      if (args.slowly) {
        await el.type(args.text as string, { delay: 50 });
      } else {
        await el.fill(args.text as string);
      }

      if (args.submit) {
        await el.press('Enter');
      }

      return `Typed "${args.text}" into "${args.element}"`;
    },
  });
}
