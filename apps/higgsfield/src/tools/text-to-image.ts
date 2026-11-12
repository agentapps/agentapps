import type { AgentApp } from '@agentapps/sdk';
import {
  pollRequestWithProgress,
  resolveCredentials,
  submitRequest,
} from '../lib/higgsfield-client.js';

/**
 * higgsfield-text-to-image — generate images from text prompts using Seedream v4.
 */
export function registerTextToImageTool(app: AgentApp): void {
  app.tool('higgsfield-text-to-image', {
    description:
      'Generate images from text prompts using Seedream v4. Params: prompt (required), resolution? ("1K"|"2K"|"4K", default "2K"), aspect_ratio? ("1:1"|"16:9"|"9:16"|"4:3"|"3:4"|"21:9"|"9:21", default "16:9"), style?, wait? (default false).',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the image to generate',
        },
        resolution: {
          type: 'string',
          enum: ['1K', '2K', '4K'],
          default: '2K',
          description: 'Output resolution',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'],
          default: '16:9',
          description: 'Aspect ratio of the generated image',
        },
        style: {
          type: 'string',
          description: 'Optional style preset',
        },
        wait: {
          type: 'boolean',
          description: 'Wait for completion (default: false)',
          default: false,
        },
      },
      required: ['prompt'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const credentials = await resolveCredentials(ctx);

      const input: Record<string, unknown> = {
        prompt: args.prompt,
        resolution: (args.resolution as string) || '2K',
        aspect_ratio: (args.aspect_ratio as string) || '16:9',
      };
      if (args.style) input.style = args.style;

      const result = await submitRequest('bytedance/seedream/v4/text-to-image', input, credentials);

      if (args.wait) {
        const completed = (await pollRequestWithProgress(
          result.request_id as string,
          credentials,
        )) as Record<string, unknown>;
        return {
          status: completed.status,
          images: completed.images,
          request_id: completed.request_id,
        };
      }

      return {
        request_id: result.request_id,
        status: result.status,
        status_url: result.status_url,
        cancel_url: result.cancel_url,
        message: 'Request submitted. Use higgsfield-get-prediction to check status.',
      };
    },
  });
}
