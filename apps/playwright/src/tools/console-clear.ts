import type { AgentApp } from '@agentapps/sdk';
import { consoleMessages, resetLastActionTime, resetLastNavigationTime } from '../browser.js';

export function registerConsoleClearTool(app: AgentApp): void {
  app.tool('console-clear', {
    description: 'Clear all captured console messages',
    parameters: { type: 'object', properties: {} },
    // Empties the in-memory console buffer of this process: a transient capture, not stored data.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      sensitive: false,
    },
    handler: async () => {
      const count = consoleMessages.length;
      consoleMessages.length = 0;
      resetLastNavigationTime();
      resetLastActionTime();
      return JSON.stringify({ cleared: count, message: `Cleared ${count} console messages` });
    },
  });
}
