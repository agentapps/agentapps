import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser } from '../browser.js';

export function registerPressKeyTool(app: AgentApp): void {
  app.tool('press-key', {
    description: 'Press a key on the keyboard',
    parameters: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description:
            'Name of the key to press or a character to generate, such as `ArrowLeft` or `a`',
        },
      },
      required: ['key'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args) => {
      const { page } = await ensureBrowser();
      await page.keyboard.press(args.key as string);
      return `Pressed key: ${args.key}`;
    },
  });
}
