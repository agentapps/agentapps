import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, findElementByRef } from '../browser.js';

export function registerDragTool(app: AgentApp): void {
  app.tool('drag', {
    description: 'Perform drag and drop between two elements',
    parameters: {
      type: 'object',
      properties: {
        startElement: {
          type: 'string',
          description:
            'Human-readable source element description used to obtain the permission to interact with the element',
        },
        startRef: {
          type: 'string',
          description: 'Exact source element reference from the page snapshot',
        },
        endElement: {
          type: 'string',
          description:
            'Human-readable target element description used to obtain the permission to interact with the element',
        },
        endRef: {
          type: 'string',
          description: 'Exact target element reference from the page snapshot',
        },
      },
      required: ['startElement', 'startRef', 'endElement', 'endRef'],
    },
    // A drag on a live web page can move or reorder something there; dragging back undoes it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args) => {
      const { page } = await ensureBrowser();

      const startEl = await findElementByRef(page, args.startRef as string);
      if (!startEl) {
        throw new Error(`Source element not found: ${args.startRef}`);
      }

      const endEl = await findElementByRef(page, args.endRef as string);
      if (!endEl) {
        throw new Error(`Target element not found: ${args.endRef}`);
      }

      // Get bounding boxes
      const startBox = await startEl.boundingBox();
      const endBox = await endEl.boundingBox();

      if (!startBox || !endBox) {
        throw new Error('Could not get element positions');
      }

      // Perform drag and drop
      await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2, {
        steps: 10,
      });
      await page.mouse.up();

      return `Dragged "${args.startElement}" to "${args.endElement}"`;
    },
  });
}
