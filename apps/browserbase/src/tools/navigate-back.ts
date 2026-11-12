import type { AgentApp } from '@agentapps/sdk';
import { requireSession } from '../lib/index.js';

export function registerNavigateBackTool(app: AgentApp): void {
  app.tool('navigate-back', {
    annotations: { readOnlyHint: false },
    description: 'Go back to the previous page.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Active session ID' },
      },
      required: ['sessionId'],
    },
    handler: async (args, _ctx) => {
      const { page } = requireSession(args.sessionId as string);
      await page.goBack();
      return `Navigated back to ${page.url()}`;
    },
  });
}
