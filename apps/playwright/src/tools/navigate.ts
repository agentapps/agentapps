import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, resetLastActionTime, resetLastNavigationTime } from '../browser.js';

export function registerNavigateTool(app: AgentApp): void {
  app.tool('navigate', {
    description: 'Navigate to a URL',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' },
        waitUntil: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle'],
          default: 'domcontentloaded',
          description:
            'When to consider navigation complete: "load" (full page load), "domcontentloaded" (DOM ready, default), "networkidle" (no network activity for 500ms). Use "networkidle" for pages that load content dynamically.',
        },
      },
      required: ['url'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args) => {
      const { page } = await ensureBrowser();
      resetLastNavigationTime();
      resetLastActionTime();
      const waitUntil =
        (args.waitUntil as 'load' | 'domcontentloaded' | 'networkidle') || 'domcontentloaded';
      // NOTE: The original MCA used navigateSafely() from the legacy MCA SDK for SSRF protection.
      // In the agent-apps framework, SSRF protection is a platform concern, not an app concern.
      await page.goto(args.url as string, { waitUntil });
      return `Navigated to ${args.url}\n\nTitle: ${await page.title()}`;
    },
  });
}
