import fs from 'node:fs/promises';
import type { AgentApp } from '@agentapps/sdk';
import { getWahaPort, wahaFetch } from '../lib/api.js';

export function registerDownloadMediaTool(app: AgentApp): void {
  app.tool('download-media', {
    description:
      'Download media (image, audio, video, document) from a WhatsApp message. Fetches the message by ID to get the media URL, then downloads the file and saves it to the specified output path. Requires the message to have hasMedia: true.',
    parameters: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'Session name (default: "default")',
        },
        messageId: {
          type: 'string',
          description: 'Message ID (e.g. "true_34612345678@c.us_AAAAAAAAAAAAA")',
        },
        chatId: {
          type: 'string',
          description:
            'Chat ID where the message was received (e.g. "34612345678@c.us"). Use "all" for GOWS/NOWEB if chatId is unknown.',
        },
        outputPath: {
          type: 'string',
          description:
            'Local path where the file will be saved (e.g. "/workspace/archivo.pdf"). /workspace/ is a shared volume accessible to all agents.',
        },
      },
      required: ['messageId', 'outputPath'],
    },
    annotations: {
      readOnlyHint: false,
      // Writes to any path on the machine and overwrites a file already there.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const {
        session = 'default',
        messageId,
        chatId = 'all',
        outputPath,
      } = args as {
        session?: string;
        messageId: string;
        chatId?: string;
        outputPath: string;
      };

      // 1. Fetch the message to get media.url
      const msgParams = new URLSearchParams({ downloadMedia: 'true' });
      const encodedChatId = encodeURIComponent(chatId);
      const encodedMsgId = encodeURIComponent(messageId);
      const msgRes = await wahaFetch(
        ctx,
        `/${session}/chats/${encodedChatId}/messages/${encodedMsgId}?${msgParams}`,
      );
      if (!msgRes.ok) {
        const err = await msgRes.json().catch(() => ({}));
        return {
          success: false,
          error: `Failed to fetch message: HTTP ${msgRes.status}`,
          detail: err,
        };
      }
      const msg = (await msgRes.json()) as {
        hasMedia?: boolean;
        media?: { url?: string; mimetype?: string; filename?: string } | null;
      };

      if (!msg.hasMedia) {
        return {
          success: false,
          error: 'Message does not have media (hasMedia is false or missing)',
        };
      }
      if (!msg.media?.url) {
        return {
          success: false,
          error:
            'Media URL not available. WAHA may not have downloaded it yet (check media storage config)',
          message: msg,
        };
      }

      // 2. Download the media file (URL may be relative to WAHA base, not the /api prefix)
      const port = await getWahaPort(ctx);
      const mediaUrl = msg.media.url.startsWith('http')
        ? msg.media.url
        : `http://localhost:${port}${msg.media.url}`;

      const fileRes = await wahaFetch(ctx, mediaUrl);
      if (!fileRes.ok) {
        return {
          success: false,
          error: `Failed to download media: HTTP ${fileRes.status}`,
          url: mediaUrl,
        };
      }
      const buffer = await fileRes.arrayBuffer();

      // 3. Write the buffer to the specified output path
      await fs.writeFile(outputPath, Buffer.from(buffer));

      const mimetype = msg.media.mimetype ?? 'application/octet-stream';
      const filename = msg.media.filename ?? null;

      return {
        success: true,
        outputPath,
        mimetype,
        filename,
        sizeBytes: buffer.byteLength,
      };
    },
  });
}
