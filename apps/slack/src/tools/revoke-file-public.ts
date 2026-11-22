import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { isFileId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface RevokeFilePublicArgs {
  fileId: string;
}

export function registerRevokeFilePublicTool(app: AgentApp): void {
  app.tool('revoke-file-public', {
    description:
      "Revoke a file's public URL (links via permalink_public stop working). Returns { fileId, revoked: true }. Not retryable. Params: fileId.",
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Slack file id.' },
      },
      required: ['fileId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { fileId } = args as unknown as RevokeFilePublicArgs;
      if (!isFileId(fileId)) {
        throw new Error(`Invalid fileId: expected F..., got "${fileId}"`);
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() => client.files.revokePublicURL({ file: fileId }));
      return { fileId, revoked: true };
    },
  });
}
