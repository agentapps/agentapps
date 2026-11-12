import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, resetLastActionTime, resetLastNavigationTime } from '../browser.js';

export function registerNavigateBackTool(app: AgentApp): void {
  app.tool('navigate-back', {
    description: 'Go back to the previous page',
    parameters: { type: 'object', properties: {} },
    annotations: { readOnlyHint: false },
    handler: async () => {
      const { page } = await ensureBrowser();
      resetLastNavigationTime();
      resetLastActionTime();
      await page.goBack();
      return `Navigated back to ${page.url()}`;
    },
  });
}
