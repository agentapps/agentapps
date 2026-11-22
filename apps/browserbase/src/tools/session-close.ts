import type { AgentApp } from '@agentapps/sdk';
import { closeSession } from '../lib/index.js';

export function registerSessionCloseTool(app: AgentApp): void {
  app.tool('session-close', {
    // Ends the cloud browser: its pages and unsaved state are gone and the session cannot be
    // reopened. Closing an already closed session does nothing (errors are ignored).
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    description: 'Close a Browserbase session and release cloud resources.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'The session ID to close',
        },
      },
      required: ['sessionId'],
    },
    handler: async (args, ctx) => {
      const installationSecrets = (await ctx.secrets.getInstallation()) ?? {};
      const apiKey = installationSecrets.BROWSERBASE_API_KEY;

      if (!apiKey) {
        throw new Error('BROWSERBASE_API_KEY must be configured in app settings.');
      }

      await closeSession(apiKey, args.sessionId as string);

      return `Session ${args.sessionId} closed successfully.`;
    },
  });
}
