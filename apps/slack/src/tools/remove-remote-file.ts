import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface RemoveRemoteFileArgs {
  externalId?: string;
  fileId?: string;
}

export function registerRemoveRemoteFileTool(app: AgentApp): void {
  app.tool('remove-remote-file', {
    description:
      'Remove a remote file reference from Slack (does not delete the file in the external provider). Provide externalId XOR fileId. Returns { removed: true }. Not retryable. Params: externalId? | fileId? (one required).',
    parameters: {
      type: 'object',
      properties: {
        externalId: { type: 'string', description: 'External provider id.' },
        fileId: { type: 'string', description: 'Slack file id.' },
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
      const { externalId, fileId } = args as unknown as RemoveRemoteFileArgs;
      if (!externalId && !fileId) throw new Error('Provide externalId or fileId.');
      if (externalId && fileId) throw new Error('Provide externalId OR fileId, not both.');
      const { botClient: client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        client.files.remote.remove(sanitiseBody({ external_id: externalId, file: fileId }) as any),
      );
      return { externalId: externalId ?? null, fileId: fileId ?? null, removed: true };
    },
  });
}
