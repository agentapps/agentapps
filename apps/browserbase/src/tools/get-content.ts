import type { AgentApp } from '@agentapps/sdk';
import { requireSession } from '../lib/index.js';

export function registerGetContentTool(app: AgentApp): void {
  app.tool('get-content', {
    annotations: { readOnlyHint: true },
    description: 'Get the current page HTML or plain text content.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Active session ID' },
        format: {
          type: 'string',
          enum: ['html', 'text'],
          description: 'Return full HTML or plain text (default: text)',
        },
      },
      required: ['sessionId'],
    },
    handler: async (args, _ctx) => {
      const { page } = requireSession(args.sessionId as string);
      const format = (args.format as string) || 'text';

      if (format === 'html') {
        return page.content();
      }

      // Plain text: extract via evaluate
      return page.evaluate(() => document.body.innerText);
    },
  });
}
