import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser } from '../browser.js';

export function registerWaitForTool(app: AgentApp): void {
  app.tool('wait-for', {
    description:
      'Wait for text to appear or disappear, a URL to load, network idle, or a specified time to pass',
    parameters: {
      type: 'object',
      properties: {
        time: { type: 'number', description: 'The time to wait in seconds' },
        text: { type: 'string', description: 'The text to wait for' },
        textGone: { type: 'string', description: 'The text to wait for to disappear' },
        url: {
          type: 'string',
          description:
            'Wait for the page URL to contain or match this string (partial match). Useful for OAuth redirects.',
        },
        networkIdle: {
          type: 'boolean',
          description:
            'Wait until there are no network connections for at least 500ms. Useful for SPA content loading.',
        },
      },
    },
    // Only waits for a time, a URL, the network or a text: it changes nothing.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args) => {
      const { page } = await ensureBrowser();

      if (args.time) {
        await page.waitForTimeout((args.time as number) * 1000);
        return `Waited ${args.time} seconds`;
      }

      if (args.url) {
        await page.waitForURL(args.url as string, { timeout: 30000 });
        return `URL matched: ${page.url()}`;
      }

      if (args.networkIdle) {
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        return 'Network is idle';
      }

      if (args.text) {
        await page.waitForSelector(`text=${args.text}`);
        return `Text "${args.text}" appeared`;
      }

      if (args.textGone) {
        await page.waitForSelector(`text=${args.textGone}`, { state: 'hidden' });
        return `Text "${args.textGone}" disappeared`;
      }

      return 'Nothing to wait for';
    },
  });
}
