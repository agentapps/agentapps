import { basename } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, findElementByRef } from '../browser.js';

export function registerTakeScreenshotTool(app: AgentApp): void {
  app.tool('take-screenshot', {
    description:
      "Take a screenshot of the current page. You can't perform actions based on the screenshot, use snapshot for actions. The screenshot is stored as an object and a link valid for one hour is returned.",
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['png', 'jpeg'],
          default: 'png',
          description: 'Image format for the screenshot. Default is png.',
        },
        filename: {
          type: 'string',
          description:
            'File name for the screenshot (e.g., "screenshot.png"). Defaults to screenshot-{timestamp}.{png|jpeg}.',
        },
        element: {
          type: 'string',
          description:
            'Human-readable element description used to obtain permission to screenshot the element. If not provided, the screenshot will be taken of viewport. If element is provided, ref must be provided too.',
        },
        ref: {
          type: 'string',
          description:
            'Exact target element reference from the page snapshot. If not provided, the screenshot will be taken of viewport. If ref is provided, element must be provided too.',
        },
        fullPage: {
          type: 'boolean',
          description:
            'When true, takes a screenshot of the full scrollable page, instead of the currently visible viewport. Cannot be used with element screenshots.',
        },
      },
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { page } = await ensureBrowser();

      const format = (args.type as 'png' | 'jpeg') || 'png';
      const filename = basename((args.filename as string) || `screenshot-${Date.now()}.${format}`);
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';

      let image: Buffer | undefined;
      if (args.ref) {
        const element = await findElementByRef(page, args.ref as string);
        if (element) {
          image = await element.screenshot({ type: format });
        }
      }
      if (!image) {
        image = await page.screenshot({ type: format, fullPage: args.fullPage as boolean });
      }

      // Store as an object and hand back a link valid for one hour.
      const object = await ctx.objects.put(image, { contentType: mimeType, filename });
      const { url } = await ctx.objects.link(object.objectId, { expiresIn: 3600 });

      return {
        output: `Screenshot saved as ${filename} — ${url}`,
        attachments: [{ url, mime: mimeType, filename }],
      };
    },
  });
}
