import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerSendImageTool(app: AgentApp): void {
  app.tool('send-image', {
    description: 'Send an image to a WhatsApp chat from a public URL.',
    parameters: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'Session name (default: "default")',
        },
        chatId: {
          type: 'string',
          description: 'Recipient chat ID (e.g. 34612345678@c.us)',
        },
        url: {
          type: 'string',
          description: 'Public HTTPS URL of the image to send',
        },
        caption: {
          type: 'string',
          description: 'Optional caption for the image',
        },
        mimetype: {
          type: 'string',
          description: 'Optional MIME type of the image (e.g. "image/jpeg", "image/png")',
        },
        filename: {
          type: 'string',
          description: 'Optional filename for the image',
        },
      },
      required: ['chatId', 'url'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        session = 'default',
        chatId,
        url,
        caption = '',
        mimetype,
        filename,
      } = args as {
        session?: string;
        chatId: string;
        url: string;
        caption?: string;
        mimetype?: string;
        filename?: string;
      };
      // Build RemoteFile object per WAHA spec: { url, mimetype?, filename? }
      const file: { url: string; mimetype?: string; filename?: string } = { url };
      if (mimetype) file.mimetype = mimetype;
      if (filename) file.filename = filename;
      const res = await wahaFetch(ctx, '/sendImage', {
        method: 'POST',
        body: JSON.stringify({ session, chatId, file, caption }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          status: res.status,
          error: `WAHA returned HTTP ${res.status}`,
          detail: err,
        };
      }
      return await res.json();
    },
  });
}
