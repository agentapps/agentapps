import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser } from '../browser.js';

export function registerHandleDialogTool(app: AgentApp): void {
  app.tool('handle-dialog', {
    description: 'Handle a dialog',
    parameters: {
      type: 'object',
      properties: {
        accept: { type: 'boolean', description: 'Whether to accept the dialog.' },
        promptText: {
          type: 'string',
          description: 'The text of the prompt in case of a prompt dialog.',
        },
      },
      required: ['accept'],
    },
    // Accepting a dialog can confirm an irreversible action of the page ("Delete?"): worst case.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args) => {
      const { page } = await ensureBrowser();

      page.once('dialog', async (dialog) => {
        if (args.accept) {
          await dialog.accept(args.promptText as string);
        } else {
          await dialog.dismiss();
        }
      });

      return `Dialog handler set: ${args.accept ? 'accept' : 'dismiss'}`;
    },
  });
}
