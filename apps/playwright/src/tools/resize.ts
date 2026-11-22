import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser } from '../browser.js';

export function registerResizeTool(app: AgentApp): void {
  app.tool('resize', {
    description: 'Resize the browser window',
    parameters: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Width of the browser window' },
        height: { type: 'number', description: 'Height of the browser window' },
      },
      required: ['width', 'height'],
    },
    // Changes only the viewport of the app's own browser.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args) => {
      const { page } = await ensureBrowser();
      await page.setViewportSize({
        width: args.width as number,
        height: args.height as number,
      });
      return `Resized viewport to ${args.width}x${args.height}`;
    },
  });
}
