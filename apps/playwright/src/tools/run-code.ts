import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser } from '../browser.js';

export function registerRunCodeTool(app: AgentApp): void {
  app.tool('run-code', {
    description: 'Run Playwright code snippet',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            "A JavaScript function containing Playwright code to execute. It will be invoked with a single argument containing { page, context, browser }. For example: `async ({ page, context, browser }) => { await page.getByRole('button', { name: 'Submit' }).click(); return await page.title(); }`",
        },
      },
      required: ['code'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args) => {
      const { page, context, browser } = await ensureBrowser();
      const code = args.code as string;

      // Create an async function from the code string and execute it with full access
      const fn = new Function(
        'page',
        'context',
        'browser',
        `return (${code})({ page, context, browser })`,
      );
      const result = await fn(page, context, browser);

      if (result === undefined) {
        return 'Code executed successfully (no return value)';
      }

      return JSON.stringify(result, null, 2);
    },
  });
}
