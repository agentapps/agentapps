import type { AgentApp } from '@agentapps/sdk';
import { requireSession } from '../lib/index.js';

export function registerNavigateTool(app: AgentApp): void {
  app.tool('navigate', {
    annotations: { readOnlyHint: false },
    description: 'Navigate the browser to a URL.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Active session ID' },
        url: { type: 'string', description: 'URL to navigate to' },
      },
      required: ['sessionId', 'url'],
    },
    handler: async (args, _ctx) => {
      const { page } = requireSession(args.sessionId as string);
      await page.goto(args.url as string, { waitUntil: 'domcontentloaded' });
      return `Navigated to ${args.url}\nTitle: ${await page.title()}`;
    },
  });
}
