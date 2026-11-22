import type { AgentApp } from '@agentapps/sdk';
import { closeBrowser } from '../browser.js';

export function registerCloseTool(app: AgentApp): void {
  app.tool('close', {
    description: 'Close the page',
    parameters: { type: 'object', properties: {} },
    // Closes the app's own browser process; nothing outside the app changes.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async () => {
      await closeBrowser();
      return 'Browser closed';
    },
  });
}
