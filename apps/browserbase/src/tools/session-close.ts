import type { AgentApp } from '@agentapps/sdk';
import { closeSession } from '../lib/index.js';

export function registerSessionCloseTool(app: AgentApp): void {
  app.tool('session-close', {
    annotations: { readOnlyHint: false },
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
