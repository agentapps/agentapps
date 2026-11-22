import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { isFileId } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface DeleteFileArgs {
  fileId: string;
}

export function registerDeleteFileTool(app: AgentApp): void {
  app.tool('delete-file', {
    description:
      'Delete a file. The token user must be owner or workspace admin. Returns { fileId, deleted: true }. Not retryable. Params: fileId (F...).',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Slack file id (F...).' },
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
      const { fileId } = args as unknown as DeleteFileArgs;
      if (!isFileId(fileId)) {
        throw new Error(`Invalid fileId: expected Slack file id (F...), got "${fileId}"`);
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() => client.files.delete({ file: fileId }));
      return { fileId, deleted: true };
    },
  });
}
