import type { AgentApp } from '@agentapps/sdk';
import { requireSession } from '../lib/index.js';

export function registerWaitForTool(app: AgentApp): void {
  app.tool('wait-for', {
    // Only waits and watches the page for text: it changes nothing.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'Wait for text to appear/disappear on the page, or wait a fixed amount of time.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Active session ID' },
        time: { type: 'number', description: 'Seconds to wait' },
        text: { type: 'string', description: 'Text to wait for (appear)' },
        textGone: { type: 'string', description: 'Text to wait to disappear' },
      },
      required: ['sessionId'],
    },
    handler: async (args, _ctx) => {
      const { page } = requireSession(args.sessionId as string);

      if (args.time) {
        await page.waitForTimeout((args.time as number) * 1000);
        return `Waited ${args.time}s`;
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
