import type { AgentApp } from '@agentapps/sdk';
import {
  pollRequestWithProgress,
  resolveCredentials,
  submitRequest,
} from '../lib/higgsfield-client.js';

/**
 * higgsfield-soul-generate — character-consistent image generation using Soul.
 */
export function registerSoulGenerateTool(app: AgentApp): void {
  app.tool('higgsfield-soul-generate', {
    description:
      'Generate images with consistent character appearance using Soul. Great for creating multiple images of the same character. Params: prompt (required), reference_image (required — URL of reference image), style?, resolution? ("1K"|"2K"|"4K", default "2K"), wait? (default false).',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the scene/pose for the character',
        },
        reference_image: {
          type: 'string',
          description: 'URL of the reference image for character consistency',
        },
        style: {
          type: 'string',
          description: 'Optional style preset',
        },
        resolution: {
          type: 'string',
          enum: ['1K', '2K', '4K'],
          default: '2K',
        },
        wait: {
          type: 'boolean',
          description: 'Wait for completion (default: false)',
          default: false,
        },
      },
      required: ['prompt', 'reference_image'],
    },
    annotations: {
      readOnlyHint: false,
      // Submits a paid generation: the credits it spends cannot be taken back.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const credentials = await resolveCredentials(ctx);

      const input: Record<string, unknown> = {
        prompt: args.prompt,
        image: args.reference_image,
        resolution: (args.resolution as string) || '2K',
      };
      if (args.style) input.style = args.style;

      const result = await submitRequest('higgsfield/soul/image-to-image', input, credentials);

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
