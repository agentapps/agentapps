import type { AgentApp } from '@agentapps/sdk';
import { requireSession } from '../lib/index.js';

export function registerPressKeyTool(app: AgentApp): void {
  app.tool('press-key', {
    // A key press on a real web page: Enter submits a form or confirms a dialog.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    description: 'Press a keyboard key.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Active session ID' },
        key: {
          type: 'string',
          description: 'Key name or character, e.g. "Enter", "ArrowDown", "a"',
        },
      },
      required: ['sessionId', 'key'],
    },
    handler: async (args, _ctx) => {
      const { page } = requireSession(args.sessionId as string);
      await page.keyboard.press(args.key as string);
      return `Pressed key: ${args.key}`;
    },
  });
}
