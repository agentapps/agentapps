import type { AgentApp } from '@agentapps/sdk';
import type { Args } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';

export function registerUploadMediaFromUrlTool(app: AgentApp): void {
  /** @spec POSTIZ-REQ-8 */
  app.tool('upload-media-from-url', {
    description:
      'Import an image or video from a public URL into the Postiz media library. Returns { success, id, url }. Pass { id, url } in the media of create-draft, schedule-post or publish-post.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Public http(s) URL of the file, e.g. https://example.com/image.png.',
        },
      },
      required: ['url'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const url = typeof a.url === 'string' ? a.url.trim() : '';
      if (!/^https?:\/\/\S+$/.test(url)) {
        throw new Error(
          `[BAD_REQUEST] Specify url as a public http(s) URL; got ${JSON.stringify(a.url)}.`,
        );
      }
      const file = await apiRequest<{ id?: string; path?: string }>(
        'POST',
        '/upload-from-url',
        ctx,
        { body: { url } },
      );
      return { success: true, id: file?.id, url: file?.path };
    },
  });
}
