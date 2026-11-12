import type { AgentApp } from '@agentapps/sdk';
import { closeBrowser } from '../browser.js';

export function registerCloseTool(app: AgentApp): void {
  app.tool('close', {
    description: 'Close the page',
    parameters: { type: 'object', properties: {} },
    annotations: { readOnlyHint: false },
    handler: async () => {
      await closeBrowser();
      return 'Browser closed';
    },
  });
}
