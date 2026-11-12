import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId } from './_helpers.js';
import { extractRemoteFile } from './_remote-files-helpers.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface ShareRemoteFileArgs {
  channels: string;
  externalId?: string;
  fileId?: string;
}

export function registerShareRemoteFileTool(app: AgentApp): void {
  app.tool('share-remote-file', {
    description:
      'Share an existing remote file to one or more channels. Provide externalId XOR fileId. Returns curated remote file. Not retryable. Params: channels (comma-separated channel ids), externalId? | fileId?.',
    parameters: {
      type: 'object',
      properties: {
        channels: {
          type: 'string',
          description: "Comma-separated channel ids (e.g. 'C123,C456').",
        },
        externalId: { type: 'string', description: 'External provider id.' },
        fileId: { type: 'string', description: 'Slack file id.' },
      },
      required: ['channels'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const { channels, externalId, fileId } = args as unknown as ShareRemoteFileArgs;
      if (!externalId && !fileId) throw new Error('Provide externalId or fileId.');
      if (externalId && fileId) throw new Error('Provide externalId OR fileId, not both.');
      if (typeof channels !== 'string' || channels.trim().length === 0) {
        throw new Error('channels must be a non-empty comma-separated string.');
      }
      // Validate every channel id segment
      const channelList = channels
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (channelList.length === 0)
        throw new Error('channels must contain at least one channel id.');
      for (let i = 0; i < channelList.length; i++) {
        validateChannelId(channelList[i], `channels[${i}]`);
      }
      const { botClient: client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.files.remote.share(
          sanitiseBody({
            external_id: externalId,
            file: fileId,
            channels: channelList.join(','),
          }) as any,
        ),
      );
      return result?.file ? extractRemoteFile(result.file) : extractRemoteFile(result);
    },
  });
}
