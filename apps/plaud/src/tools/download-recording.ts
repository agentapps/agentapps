import type { AgentApp } from '@agentapps/sdk';
import { getPlaudClient } from '../lib/index.js';

export function registerDownloadRecordingTool(app: AgentApp): void {
  app.tool('download-recording', {
    description:
      'Download a PLAUD recording audio file. Returns a public or presigned URL to the recording audio.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The recording file ID (32-char hex string)',
        },
      },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const id = (args as Record<string, unknown>).id as string;

      const client = await getPlaudClient(ctx);
      // The official Plaud MCP get_file tool returns a presigned_url field that is
      // valid for 24 hours. We return it directly as the audio download URL.
      const result = (await client.getFileDetail(id)) as Record<string, unknown>;

      return {
        id,
        audio_url: (result.presigned_url ??
          result.audio_url ??
          result.audioUrl ??
          result.url ??
          result.download_url ??
          undefined) as string | undefined,
        title: (result.name ?? result.title ?? result.file_name ?? '') as string,
      };
    },
  });
}
