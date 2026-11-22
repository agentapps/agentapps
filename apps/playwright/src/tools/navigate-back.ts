import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, resetLastActionTime, resetLastNavigationTime } from '../browser.js';

export function registerNavigateBackTool(app: AgentApp): void {
  app.tool('navigate-back', {
    description: 'Go back to the previous page',
    parameters: { type: 'object', properties: {} },
    // Moves the app's own browser one step back in history: a page load, not an action on the page.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async () => {
      const { page } = await ensureBrowser();
      resetLastNavigationTime();
      resetLastActionTime();
      await page.goBack();
      return `Navigated back to ${page.url()}`;
    },
  });
}
