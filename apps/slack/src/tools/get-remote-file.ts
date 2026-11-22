import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractRemoteFile } from './_remote-files-helpers.js';
import { sanitiseBody, wrapSlackCall } from './utils.js';

interface GetRemoteFileArgs {
  externalId?: string;
  fileId?: string;
  includeRaw?: boolean;
}

export function registerGetRemoteFileTool(app: AgentApp): void {
  app.tool('get-remote-file', {
    description:
      'Get details of a remote file. Provide externalId XOR fileId. Returns curated remote file. Retryable. Params: externalId? | fileId?.',
    parameters: {
      type: 'object',
      properties: {
        externalId: { type: 'string', description: 'External provider id.' },
        fileId: { type: 'string', description: 'Slack file id.' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { externalId, fileId, includeRaw } = args as unknown as GetRemoteFileArgs;
      if (!externalId && !fileId) throw new Error('Provide externalId or fileId.');
      if (externalId && fileId) throw new Error('Provide externalId OR fileId, not both.');
      const { botClient: client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() =>
        client.files.remote.info(sanitiseBody({ external_id: externalId, file: fileId }) as any),
      );
      if (includeRaw) return result;
      return result?.file ? extractRemoteFile(result.file) : extractRemoteFile(result);
    },
  });
}
