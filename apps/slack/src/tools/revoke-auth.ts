import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface RevokeAuthArgs {
  test?: boolean;
}

export function registerRevokeAuthTool(app: AgentApp): void {
  app.tool('revoke-auth', {
    description:
      'Revoke the current OAuth token (logs the user out of this Slack workspace from Agent Apps). Returns { revoked: true }. Not retryable — destructive. Params: test (def false — set true to validate without actually revoking).',
    parameters: {
      type: 'object',
      properties: {
        test: {
          type: 'boolean',
          description: 'If true, simulate without revoking (for validation). Default false.',
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { test } = args as unknown as RevokeAuthArgs;
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.auth.revoke(sanitiseBody({ test: test ?? false }) as any),
      );
      return {
        revoked: (result as any).revoked ?? !test,
        test: test ?? false,
      };
    },
  });
}
